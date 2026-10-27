"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/role";
import { db } from "@/lib/supabase";
import { Fields, type FormState } from "@/lib/validation";

type Kind = "customers" | "suppliers";
const META = {
  customers: { id: "customer_id", name: "customer_name", prefix: "CUS-", label: "Customer" },
  suppliers: { id: "supplier_id", name: "supplier_name", prefix: "SUP-", label: "Supplier" },
} as const;

// IDs are CUS-## / SUP-##; the number grows past two digits when needed.
async function nextId(kind: Kind) {
  const m = META[kind];
  const { data } = await db().from(kind).select(m.id);
  const max = ((data ?? []) as unknown as Record<string, string>[]).reduce((n, r) => Math.max(n, Number(r[m.id].slice(4)) || 0), 0);
  return `${m.prefix}${String(max + 1).padStart(2, "0")}`;
}

// Names identify a partner in every list, so they must be unique (case-insensitive).
async function nameTaken(kind: Kind, name: string, exceptId?: string) {
  const m = META[kind];
  const { data } = await db().from(kind).select(m.id).ilike(m.name, name.replace(/[%_\\]/g, "\\$&"));
  return ((data ?? []) as unknown as Record<string, string>[]).some((r) => r[m.id] !== exceptId);
}

function readCustomer(f: Fields) {
  return {
    customer_name: f.text("customer_name", "Name"),
    city: f.text("city", "City", { required: false }) || null,
    country: f.text("country", "Country", { required: false }) || null,
    contact: f.text("contact", "Contact", { required: false, max: 120 }) || null,
  };
}

function readSupplier(f: Fields) {
  return {
    supplier_name: f.text("supplier_name", "Name"),
    country: f.text("country", "Country", { required: false }) || null,
    contact: f.text("contact", "Contact", { required: false, max: 120 }) || null,
    lead_time_days: f.number("lead_time_days", "Default lead time", { min: 0, max: 365, integer: true }),
  };
}

async function save(kind: Kind, f: Fields, values: Record<string, unknown>, id?: string): Promise<FormState> {
  const m = META[kind];
  const name = String(values[m.name]);
  if (f.valid && (await nameTaken(kind, name, id))) f.errors[m.name] = `A ${m.label.toLowerCase()} with this name already exists.`;
  if (!f.valid) return f.fail();

  const newId = id ?? (await nextId(kind));
  const { error } = id
    ? await db().from(kind).update(values).eq(m.id, id)
    : await db().from(kind).insert({ [m.id]: newId, ...values, status: "Active" });
  if (error) return { ok: false, message: `Saving failed: ${error.message}`, values: f.values };
  revalidatePath("/", "layout");
  // values.id lets the sales form select a customer it just created.
  return { ok: true, message: `${m.label} ${id ? "updated" : "created"}.`, values: { id: newId } };
}

export async function createCustomer(_prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  return save("customers", f, readCustomer(f));
}

export async function updateCustomer(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  return save("customers", f, readCustomer(f), id);
}

export async function createSupplier(_prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  return save("suppliers", f, readSupplier(f));
}

export async function updateSupplier(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireManager();
  const f = new Fields(form);
  return save("suppliers", f, readSupplier(f), id);
}

// Deactivating never deletes: orders keep pointing to the partner, and open
// orders continue. Inactive partners just cannot be chosen for new orders.
export async function setPartnerStatus(kind: Kind, id: string, status: "Active" | "Inactive"): Promise<void> {
  await requireManager();
  const { error } = await db().from(kind).update({ status }).eq(META[kind].id, id);
  if (error) throw new Error(`Could not change the status: ${error.message}`);
  revalidatePath("/", "layout");
}
