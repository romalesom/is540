-- Items ↔ suppliers becomes n:m.
-- item_suppliers holds each supplier's offer for an item: its price and an
-- optional item-specific lead time (null → suppliers.lead_time_days).
-- items.unit_cost_eur stays as the standard cost used for valuation and margin.

-- Step 1 (compatible with the previous app version): create and backfill.
create table public.item_suppliers (
  item_id        text    not null references public.items(item_id),
  supplier_id    text    not null references public.suppliers(supplier_id),
  unit_cost_eur  numeric not null check (unit_cost_eur > 0),
  lead_time_days integer          check (lead_time_days is null or lead_time_days between 0 and 365),
  primary key (item_id, supplier_id)
);
create index item_suppliers_supplier_id_idx on public.item_suppliers(supplier_id);
alter table public.item_suppliers enable row level security;

insert into public.item_suppliers (item_id, supplier_id, unit_cost_eur, lead_time_days)
select item_id, supplier_id, unit_cost_eur, null from public.items;

-- New items are created without the old column while it still exists.
alter table public.items alter column supplier_id drop not null;

-- Step 2 (after the new app version is deployed): drop the old 1:n link.
-- alter table public.items drop column supplier_id;
