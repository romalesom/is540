-- Physical stock counts and scrapping.
--   post_stock_count → one count per location: machines are checked off by
--                      serial number (not found → Missing, previously missing
--                      but found → InStock again), accessories are counted as
--                      a quantity. Every difference becomes a stock adjustment.
--   scrap_stock      → write off machines (by serial) or an accessory quantity.
-- Adjustments are valued at standard cost (machines: acquisition cost) so
-- reporting can show write-offs.

alter table public.assets drop constraint assets_status_check;
alter table public.assets add constraint assets_status_check
  check (status in ('InStock', 'InTransit', 'InService', 'Missing', 'Sold', 'Scrapped'));

create table public.stock_counts (
  count_id    text primary key,
  location_id text not null references public.locations(location_id),
  count_date  date not null default current_date,
  note        text
);
alter table public.stock_counts enable row level security;

create table public.stock_adjustments (
  adjustment_id   text primary key,
  item_id         text not null references public.items(item_id),
  location_id     text not null references public.locations(location_id),
  adjustment_date date not null default current_date,
  quantity        integer not null check (quantity <> 0),   -- signed: + found, − missing / scrapped
  reason          text not null check (reason in ('Count difference', 'Scrapped')),
  value_eur       numeric not null,                        -- signed value change at cost
  count_id        text references public.stock_counts(count_id),
  note            text
);
create index stock_adjustments_item_id_idx on public.stock_adjustments(item_id);
create index stock_adjustments_count_id_idx on public.stock_adjustments(count_id);
alter table public.stock_adjustments enable row level security;

create table public.stock_adjustment_assets (
  adjustment_id text not null references public.stock_adjustments(adjustment_id),
  asset_id      text not null references public.assets(asset_id),
  primary key (adjustment_id, asset_id)
);
create index stock_adjustment_assets_asset_id_idx on public.stock_adjustment_assets(asset_id);
alter table public.stock_adjustment_assets enable row level security;

create or replace function public.next_adjustment_id() returns text
language sql set search_path = public
as $$
  select 'ADJ-' || lpad((coalesce(max(substring(adjustment_id from 5)::integer), 0) + 1)::text, 5, '0') from stock_adjustments;
$$;

-- p_counts: [{"item_id": "MCH-020", "counted": 12}, …] for quantity-tracked items.
create or replace function public.post_stock_count(
  p_location_id text, p_missing_asset_ids text[], p_found_asset_ids text[], p_counts jsonb, p_note text
) returns text
language plpgsql
set search_path = public
as $$
declare
  v_id text; v_adj text; r record; v_have integer; v_cost numeric;
begin
  perform 1 from locations where location_id = p_location_id;
  if not found then raise exception 'Unknown location %.', p_location_id; end if;
  p_missing_asset_ids := coalesce(p_missing_asset_ids, '{}');
  p_found_asset_ids := coalesce(p_found_asset_ids, '{}');

  if (select count(*) from assets where asset_id = any(p_missing_asset_ids) and status = 'InStock' and location_id = p_location_id)
     <> cardinality(p_missing_asset_ids) then
    raise exception 'Some machines marked as missing are no longer in stock at this location. Reload the count sheet.';
  end if;
  if (select count(*) from assets where asset_id = any(p_found_asset_ids) and status = 'Missing' and location_id = p_location_id)
     <> cardinality(p_found_asset_ids) then
    raise exception 'Some machines marked as found are not missing at this location. Reload the count sheet.';
  end if;

  select 'CNT-' || lpad((coalesce(max(substring(count_id from 5)::integer), 0) + 1)::text, 4, '0') into v_id from stock_counts;
  insert into stock_counts (count_id, location_id, note) values (v_id, p_location_id, nullif(trim(p_note), ''));

  -- Machines: one adjustment per item and direction.
  for r in
    select a.item_id, -1 as dir, array_agg(a.asset_id) as ids, sum(a.acquisition_cost_eur) as cost
    from assets a where a.asset_id = any(p_missing_asset_ids) group by a.item_id
    union all
    select a.item_id, 1, array_agg(a.asset_id), sum(a.acquisition_cost_eur)
    from assets a where a.asset_id = any(p_found_asset_ids) group by a.item_id
  loop
    v_adj := next_adjustment_id();
    insert into stock_adjustments (adjustment_id, item_id, location_id, quantity, reason, value_eur, count_id)
    values (v_adj, r.item_id, p_location_id, r.dir * cardinality(r.ids), 'Count difference', r.dir * r.cost, v_id);
    insert into stock_adjustment_assets (adjustment_id, asset_id) select v_adj, unnest(r.ids);
    update assets set status = case when r.dir < 0 then 'Missing' else 'InStock' end where asset_id = any(r.ids);
  end loop;

  -- Accessories: counted quantity replaces the book quantity.
  for r in
    select c.item_id, c.counted, i.unit_cost_eur, i.tracking_mode
    from jsonb_to_recordset(coalesce(p_counts, '[]'::jsonb)) as c(item_id text, counted integer)
    join items i on i.item_id = c.item_id
  loop
    if r.tracking_mode <> 'Quantity' then raise exception 'Item % is counted by serial number.', r.item_id; end if;
    if r.counted is null or r.counted < 0 then raise exception 'Counted quantity for % must be 0 or more.', r.item_id; end if;
    select stock_qty into v_have from inventory where item_id = r.item_id and location_id = p_location_id for update;
    v_have := coalesce(v_have, 0);
    continue when r.counted = v_have;
    v_adj := next_adjustment_id();
    insert into stock_adjustments (adjustment_id, item_id, location_id, quantity, reason, value_eur, count_id)
    values (v_adj, r.item_id, p_location_id, r.counted - v_have, 'Count difference', (r.counted - v_have) * r.unit_cost_eur, v_id);
    insert into inventory (item_id, location_id, stock_qty, condition)
    values (r.item_id, p_location_id, r.counted, 'New')
    on conflict (item_id, location_id) do update set stock_qty = excluded.stock_qty;
  end loop;

  return v_id;
end;
$$;

create or replace function public.scrap_stock(
  p_item_id text, p_location_id text, p_quantity integer, p_asset_ids text[], p_note text
) returns text
language plpgsql
set search_path = public
as $$
declare
  it items%rowtype; v_adj text; v_have integer; v_cost numeric; v_count integer;
begin
  select * into it from items where item_id = p_item_id;
  if not found then raise exception 'Item % not found.', p_item_id; end if;
  if nullif(trim(p_note), '') is null then raise exception 'Please give a reason for scrapping.'; end if;
  v_adj := next_adjustment_id();

  if it.tracking_mode = 'Serialized' then
    select count(*), coalesce(sum(acquisition_cost_eur), 0) into v_count, v_cost
    from assets where asset_id = any(p_asset_ids) and item_id = p_item_id and location_id = p_location_id and status = 'InStock';
    if v_count = 0 or v_count <> cardinality(p_asset_ids) then
      raise exception 'Choose machines that are in stock at this location.';
    end if;
    insert into stock_adjustments (adjustment_id, item_id, location_id, quantity, reason, value_eur, note)
    values (v_adj, p_item_id, p_location_id, -v_count, 'Scrapped', -v_cost, trim(p_note));
    insert into stock_adjustment_assets (adjustment_id, asset_id) select v_adj, unnest(p_asset_ids);
    update assets set status = 'Scrapped', condition = 'Defective' where asset_id = any(p_asset_ids);
  else
    select stock_qty into v_have from inventory where item_id = p_item_id and location_id = p_location_id for update;
    if p_quantity is null or p_quantity < 1 or p_quantity > coalesce(v_have, 0) then
      raise exception 'Between 1 and % units can be scrapped here.', coalesce(v_have, 0);
    end if;
    insert into stock_adjustments (adjustment_id, item_id, location_id, quantity, reason, value_eur, note)
    values (v_adj, p_item_id, p_location_id, -p_quantity, 'Scrapped', -p_quantity * it.unit_cost_eur, trim(p_note));
    update inventory set stock_qty = stock_qty - p_quantity where item_id = p_item_id and location_id = p_location_id;
  end if;
  return v_adj;
end;
$$;

revoke all on function public.next_adjustment_id() from public, anon, authenticated;
revoke all on function public.post_stock_count(text, text[], text[], jsonb, text) from public, anon, authenticated;
revoke all on function public.scrap_stock(text, text, integer, text[], text) from public, anon, authenticated;
grant execute on function public.next_adjustment_id() to service_role;
grant execute on function public.post_stock_count(text, text[], text[], jsonb, text) to service_role;
grant execute on function public.scrap_stock(text, text, integer, text[], text) to service_role;

create or replace view public.stock_movements as
select purchase_orders.item_id, purchase_orders.location_id, purchase_orders.received_date as movement_date,
       'IN'::text as direction, purchase_orders.quantity, purchase_orders.purchase_order_id as reference,
       'Purchase receipt'::text as movement_type
from purchase_orders where purchase_orders.status = 'Received'
union all
select sales_orders.item_id, sales_orders.location_id, sales_orders.order_date, 'OUT'::text,
       sales_orders.quantity, sales_orders.order_id, 'Sales order'::text
from sales_orders where sales_orders.order_status <> 'Cancelled'
union all
select o.item_id, r.location_id, r.return_date, 'IN'::text, r.quantity, r.return_id, 'Customer return'::text
from sales_returns r join sales_orders o on o.order_id = r.order_id
where r.disposition = 'Resellable'
union all
select t.item_id, t.from_location_id, t.shipped_date, 'OUT'::text, t.quantity, t.transfer_id, 'Transfer out'::text
from stock_transfers t where t.status <> 'Cancelled'
union all
select t.item_id, t.to_location_id, t.received_date, 'IN'::text, t.quantity, t.transfer_id, 'Transfer in'::text
from stock_transfers t where t.status = 'Received'
union all
select a.item_id, a.location_id, a.adjustment_date, case when a.quantity > 0 then 'IN' else 'OUT' end,
       abs(a.quantity), a.adjustment_id, a.reason
from stock_adjustments a;
