-- Configurable VAT rate and discount tiers, maintained on /settings.
-- VAT is display-only: gross prices are shown for prices that have not been
-- transacted yet (items, supplier offers, new-order forms) and are never stored.

create table public.app_settings (
  id         smallint primary key default 1 check (id = 1),
  vat_rate   numeric(4,3) not null default 0.19 check (vat_rate >= 0 and vat_rate < 1),
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
insert into public.app_settings (id, vat_rate) values (1, 0.19);

-- Discount rates offered on sales orders ("no discount" is always offered).
-- min_qty set → preselected for machines ordered at least that many at a time;
-- the highest reached tier wins. null → offered, never preselected.
create table public.discount_tiers (
  rate    numeric(4,3) primary key check (rate > 0 and rate < 1),
  min_qty integer check (min_qty is null or min_qty between 1 and 500)
);
alter table public.discount_tiers enable row level security;
insert into public.discount_tiers (rate, min_qty) values (0.05, 3), (0.10, null);

-- Rates are now configurable, so the order column only checks the range.
-- Removing a tier never changes existing orders.
alter table public.sales_orders drop constraint sales_orders_discount_check;
alter table public.sales_orders add constraint sales_orders_discount_check check (discount >= 0 and discount < 1);
