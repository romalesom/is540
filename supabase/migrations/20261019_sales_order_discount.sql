-- Sales orders store their discount as a decimal fraction (0.05 = 5 %).
-- unit_price_eur stays the net price after discount; the list price at order
-- time is unit_price_eur / (1 - discount).
-- Allowed steps: 0, 0.05, 0.10 (the app offers exactly these).

alter table public.sales_orders
  add column discount numeric(4,3) not null default 0
  check (discount in (0, 0.05, 0.10));

-- Backfill from the current list prices. Prices have not changed since the
-- data was migrated, so every order resolves to exactly 0 or 0.05.
update public.sales_orders o
set discount = round(1 - o.unit_price_eur / i.sale_price_eur, 2)
from public.items i
where i.item_id = o.item_id
  and o.unit_price_eur < i.sale_price_eur;
