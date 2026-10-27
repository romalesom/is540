import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { ManagerOnly, PageHeader } from "@/components/ui";
import { getCountSheet, getInventory, getLocations } from "@/lib/data";
import { getRole } from "@/lib/role";
import { CountSheetForm } from "./count-sheet";

export default async function NewCountPage({ searchParams }: PageProps<"/counts/new">) {
  if ((await getRole()) !== "manager") return <ManagerOnly />;
  const sp = await searchParams;
  const locations = await getLocations();
  const location = locations.find((l) => l.location_id === sp.location);
  if (!location) notFound();
  const [sheet, inventory] = await Promise.all([getCountSheet(location.location_id), getInventory()]);
  const cost = Object.fromEntries(inventory.map((i) => [i.item_id, i.unit_cost_eur]));

  return (
    <div className="max-w-5xl">
      <Link href="/counts" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="arrow_back" className="!text-[18px]" /> Stock counts
      </Link>
      <PageHeader
        eyebrow="Stock count"
        title={location.location_name}
        description="Uncheck every machine you cannot find and enter the counted quantity of each accessory. The book quantities are prefilled."
      />
      <CountSheetForm locationId={location.location_id} sheet={sheet} cost={cost} />
    </div>
  );
}
