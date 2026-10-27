"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { SERVICE_TYPES } from "@/lib/data";
import { requireManager } from "@/lib/role";
import { Fields, type FormState } from "@/lib/validation";

const OUTCOMES = ["Completed", "Follow-up needed"] as const;

export async function recordService(assetId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  const today = new Date().toISOString().slice(0, 10);
  const serviceDate = f.text("service_date", "Service date", { max: 10 });
  const nextDue = f.text("next_service_due", "Next service", { max: 10 });
  const serviceType = f.oneOf("service_type", "Service type", SERVICE_TYPES);
  const technician = f.text("technician", "Technician", { max: 60 });
  const outcome = f.oneOf("outcome", "Outcome", OUTCOMES);
  const cost = f.number("cost_eur", "Cost", { min: 0, max: 5_000 });

  if (serviceDate && !f.errors.service_date && serviceDate > today) {
    f.errors.service_date = "A service cannot be recorded in the future.";
  }
  if (nextDue && !f.errors.next_service_due && serviceDate && nextDue <= serviceDate) {
    f.errors.next_service_due = "Must be after the service date.";
  }

  const client = db();
  const { data: asset } = await client.from("assets").select("status").eq("asset_id", assetId).maybeSingle();
  if (!asset) return { ok: false, message: `Machine ${assetId} not found.` };
  if (asset.status === "Scrapped") return { ok: false, message: "Scrapped machines cannot be serviced." };
  // Only machines at a customer are charged; services on stock machines are internal.
  const billable = asset.status === "Sold";
  const price = billable ? f.number("price_eur", "Price", { min: 0, max: 10_000 }) : 0;
  if (!f.valid) return f.fail();

  // Service IDs are SVC-<4 digits>, so text order equals numeric order.
  const { data: last } = await client.from("service_history").select("service_id").order("service_id", { ascending: false }).limit(1);
  const nextNo = Number(last?.[0]?.service_id.replace("SVC-", "") ?? 0) + 1;

  const { error } = await client.from("service_history").insert({
    service_id: `SVC-${String(nextNo).padStart(4, "0")}`,
    asset_id: assetId,
    service_date: serviceDate,
    service_type: serviceType,
    technician,
    cost_eur: cost,
    price_eur: price,
    outcome,
    next_service_due: nextDue,
  });
  if (error) return { ok: false, message: `Service could not be saved: ${error.message}`, values: f.values };

  revalidatePath("/", "layout");
  return { ok: true, message: `Service recorded. Next service due ${nextDue}.` };
}
