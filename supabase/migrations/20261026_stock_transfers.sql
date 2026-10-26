-- Stock transfers between own locations with an in-transit state.
--   create_stock_transfer  → goods leave the source (machines FIFO → InTransit,
--                            accessories leave inventory); status InTransit
--   receive_stock_transfer → goods arrive at the destination; status Received
--   cancel_stock_transfer  → goods go back to the source; status Cancelled
-- In-transit goods still count towards inventory value but are available
-- nowhere (v_stock only counts InStock machines and inventory rows).

alter table public.assets drop constraint assets_status_check;
alter table public.assets add constraint assets_status_check
  check (status in ('InStock', 'InTransit', 'InService', 'Sold', 'Scrapped'));

create table public.stock_transfers (
  transfer_id      text primary key,
  item_id          text not null references public.items(item_id),
  from_location_id text not null references public.locations(location_id),
  to_location_id   text not null references public.locations(location_id),
  quantity         integer not null check (quantity > 0),
  status           text not null default 'InTransit' check (status in ('InTransit', 'Received', 'Cancelled')),
  shipped_date     date not null default current_date,
  received_date    date,
  check (from_location_id <> to_location_id)
);
create index stock_transfers_status_idx on public.stock_transfers(status);
alter table public.stock_transfers enable row level security;

create table public.stock_transfer_assets (
  transfer_id text not null references public.stock_transfers(transfer_id),
  asset_id    text not null references public.assets(asset_id),
  primary key (transfer_id, asset_id)
);
create index stock_transfer_assets_asset_id_idx on public.stock_transfer_assets(asset_id);
alter table public.stock_transfer_assets enable row level security;

create or replace function public.create_stock_transfer(p_item_id text, p_from text, p_to text, p_quantity integer)
returns text
language plpgsql
set search_path = public
as $$
declare
  it items%rowtype; v_id text; v_assets text[]; v_have integer;
begin
  select * into it from items where item_id = p_item_id;
  if not found then raise exception 'Item % not found.', p_item_id; end if;
  if it.status <> 'Active' then raise exception 'Discontinued items cannot be transferred.'; end if;
  if p_from = p_to then raise exception 'Source and destination must differ.'; end if;
  perform 1 from locations where location_id in (p_from, p_to) having count(*) = 2;
  if not found then raise exception 'Unknown location.'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1.'; end if;

  if it.tracking_mode = 'Serialized' then
    -- First in, first out, as for sales.
    select array_agg(asset_id) into v_assets from (
      select asset_id from assets
      where item_id = p_item_id and location_id = p_from and status = 'InStock'
      order by received_date, asset_id
      limit p_quantity
      for update
    ) a;
    if coalesce(cardinality(v_assets), 0) < p_quantity then
      raise exception 'Only % available at the source location.', coalesce(cardinality(v_assets), 0);
    end if;
  else
    select stock_qty into v_have from inventory where item_id = p_item_id and location_id = p_from for update;
    if coalesce(v_have, 0) < p_quantity then
      raise exception 'Only % available at the source location.', coalesce(v_have, 0);
    end if;
  end if;

  select 'TRF-' || lpad((coalesce(max(substring(transfer_id from 5)::integer), 0) + 1)::text, 4, '0')
  into v_id from stock_transfers;
  insert into stock_transfers (transfer_id, item_id, from_location_id, to_location_id, quantity)
  values (v_id, p_item_id, p_from, p_to, p_quantity);

  if it.tracking_mode = 'Serialized' then
    insert into stock_transfer_assets (transfer_id, asset_id) select v_id, unnest(v_assets);
    update assets set status = 'InTransit', location_id = null where asset_id = any(v_assets);
  else
    update inventory set stock_qty = stock_qty - p_quantity where item_id = p_item_id and location_id = p_from;
  end if;
  return v_id;
end;
$$;

-- Shared by receive and cancel: put the goods of an in-transit transfer
-- down at p_location and close it with p_status.
create or replace function public.close_stock_transfer(p_transfer_id text, p_status text)
returns void
language plpgsql
set search_path = public
as $$
declare
  t stock_transfers%rowtype; v_location text;
begin
  select * into t from stock_transfers where transfer_id = p_transfer_id for update;
  if not found then raise exception 'Transfer % not found.', p_transfer_id; end if;
  if t.status <> 'InTransit' then raise exception 'Transfer % is already %.', p_transfer_id, lower(t.status); end if;
  v_location := case p_status when 'Received' then t.to_location_id when 'Cancelled' then t.from_location_id end;
  if v_location is null then raise exception 'Unknown status %.', p_status; end if;

  if exists (select 1 from stock_transfer_assets where transfer_id = p_transfer_id) then
    update assets set status = 'InStock', location_id = v_location
    where asset_id in (select asset_id from stock_transfer_assets where transfer_id = p_transfer_id)
      and status = 'InTransit';
  else
    insert into inventory (item_id, location_id, stock_qty, condition)
    values (t.item_id, v_location, t.quantity, 'New')
    on conflict (item_id, location_id) do update set stock_qty = inventory.stock_qty + excluded.stock_qty;
  end if;

  update stock_transfers
  set status = p_status, received_date = case when p_status = 'Received' then current_date end
  where transfer_id = p_transfer_id;
end;
$$;

create or replace function public.receive_stock_transfer(p_transfer_id text) returns void
language sql set search_path = public
as $$ select close_stock_transfer(p_transfer_id, 'Received'); $$;

create or replace function public.cancel_stock_transfer(p_transfer_id text) returns void
language sql set search_path = public
as $$ select close_stock_transfer(p_transfer_id, 'Cancelled'); $$;

revoke all on function public.create_stock_transfer(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.close_stock_transfer(text, text) from public, anon, authenticated;
revoke all on function public.receive_stock_transfer(text) from public, anon, authenticated;
revoke all on function public.cancel_stock_transfer(text) from public, anon, authenticated;
grant execute on function public.create_stock_transfer(text, text, text, integer) to service_role;
grant execute on function public.close_stock_transfer(text, text) to service_role;
grant execute on function public.receive_stock_transfer(text) to service_role;
grant execute on function public.cancel_stock_transfer(text) to service_role;

-- Units in transit per item (valued, but not available anywhere).
create or replace view public.v_in_transit as
select item_id, sum(quantity)::integer as quantity
from stock_transfers
where status = 'InTransit'
group by item_id;

-- Transfers: OUT at the source when shipped, IN at the destination when received.
-- Cancelled transfers net to zero and are left out.
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
from stock_transfers t where t.status = 'Received';
