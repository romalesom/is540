-- Customer returns for shipped or delivered sales orders.
-- Booked atomically by create_sales_return(); the app only calls the function.
--   Resellable → machines back to InStock (condition Used) / accessories back to inventory
--   Defective  → machines Scrapped (condition Defective) / accessories written off
-- Reporting books the refund in the month of the return (like a credit note);
-- COGS is reversed only for resellable goods.

alter table public.sales_orders drop constraint sales_orders_order_status_check;
alter table public.sales_orders add constraint sales_orders_order_status_check
  check (order_status in ('Open', 'Shipped', 'Delivered', 'Returned', 'Cancelled'));

create table public.sales_returns (
  return_id   text primary key,
  order_id    text not null references public.sales_orders(order_id),
  return_date date not null default current_date,
  quantity    integer not null check (quantity > 0),
  disposition text not null check (disposition in ('Resellable', 'Defective')),
  location_id text not null references public.locations(location_id),
  reason      text,
  refund_eur  numeric not null check (refund_eur >= 0),  -- quantity × net unit price of the order
  cost_eur    numeric not null check (cost_eur >= 0)     -- acquisition cost of the returned goods
);
create index sales_returns_order_id_idx on public.sales_returns(order_id);
alter table public.sales_returns enable row level security;

-- Which machines came back. Kept even after a machine is resold, so the
-- original order keeps its cost (assets.order_id then points to the new sale).
create table public.sales_return_assets (
  return_id text not null references public.sales_returns(return_id),
  asset_id  text not null references public.assets(asset_id),
  primary key (return_id, asset_id)
);
create index sales_return_assets_asset_id_idx on public.sales_return_assets(asset_id);
alter table public.sales_return_assets enable row level security;

create or replace function public.create_sales_return(
  p_order_id    text,
  p_quantity    integer,
  p_asset_ids   text[],
  p_disposition text,
  p_location_id text,
  p_reason      text
) returns text
language plpgsql
set search_path = public
as $$
declare
  o          sales_orders%rowtype;
  it         items%rowtype;
  v_returned integer;
  v_open     integer;
  v_id       text;
  v_cost     numeric;
  v_count    integer;
begin
  select * into o from sales_orders where order_id = p_order_id for update;
  if not found then raise exception 'Sales order % not found.', p_order_id; end if;
  if o.order_status not in ('Shipped', 'Delivered') then
    raise exception 'Only shipped or delivered orders can be returned.';
  end if;
  if p_disposition not in ('Resellable', 'Defective') then raise exception 'Unknown condition %.', p_disposition; end if;
  perform 1 from locations where location_id = p_location_id;
  if not found then raise exception 'Unknown location %.', p_location_id; end if;

  select coalesce(sum(quantity), 0) into v_returned from sales_returns where order_id = p_order_id;
  v_open := o.quantity - v_returned;
  if p_quantity is null or p_quantity < 1 or p_quantity > v_open then
    raise exception 'Between 1 and % units can still be returned.', v_open;
  end if;

  select * into it from items where item_id = o.item_id;

  if it.tracking_mode = 'Serialized' then
    select count(*), coalesce(sum(acquisition_cost_eur), 0) into v_count, v_cost
    from assets
    where asset_id = any(p_asset_ids) and order_id = p_order_id and status = 'Sold';
    if v_count <> p_quantity or coalesce(cardinality(p_asset_ids), 0) <> p_quantity then
      raise exception 'Choose exactly % machine(s) sold with this order.', p_quantity;
    end if;
  else
    v_cost := p_quantity * it.unit_cost_eur;
  end if;

  select 'RET-' || lpad((coalesce(max(substring(return_id from 5)::integer), 0) + 1)::text, 4, '0')
  into v_id from sales_returns;

  insert into sales_returns (return_id, order_id, return_date, quantity, disposition, location_id, reason, refund_eur, cost_eur)
  values (v_id, p_order_id, current_date, p_quantity, p_disposition, p_location_id,
          nullif(trim(p_reason), ''), round(p_quantity * o.unit_price_eur, 2), v_cost);

  if it.tracking_mode = 'Serialized' then
    insert into sales_return_assets (return_id, asset_id) select v_id, unnest(p_asset_ids);
    update assets
    set status      = case when p_disposition = 'Resellable' then 'InStock' else 'Scrapped' end,
        condition   = case when p_disposition = 'Resellable' then 'Used' else 'Defective' end,
        location_id = p_location_id,
        order_id    = null
    where asset_id = any(p_asset_ids);
  elsif p_disposition = 'Resellable' then
    insert into inventory (item_id, location_id, stock_qty, condition)
    values (o.item_id, p_location_id, p_quantity, 'New')
    on conflict (item_id, location_id) do update set stock_qty = inventory.stock_qty + excluded.stock_qty;
  end if;

  if v_returned + p_quantity = o.quantity then
    update sales_orders set order_status = 'Returned' where order_id = p_order_id;
  end if;

  return v_id;
end;
$$;

-- Only the server (secret key → service_role) may book returns.
revoke all on function public.create_sales_return(text, integer, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.create_sales_return(text, integer, text[], text, text, text) to service_role;

-- Order cost includes machines that were sold with the order and later returned.
create or replace view public.v_order_margin as
select o.order_id,
       o.order_date,
       o.item_id,
       o.quantity,
       o.unit_price_eur,
       o.quantity::numeric * o.unit_price_eur as line_total_eur,
       coalesce(ac.cost, o.quantity::numeric * i.unit_cost_eur) as cost_eur,
       o.quantity::numeric * o.unit_price_eur - coalesce(ac.cost, o.quantity::numeric * i.unit_cost_eur) as margin_eur
from sales_orders o
join items i on i.item_id = o.item_id
left join lateral (
  select sum(x.cost) as cost
  from (
    select a.acquisition_cost_eur as cost from assets a where a.order_id = o.order_id
    union all
    select a.acquisition_cost_eur
    from sales_returns r
    join sales_return_assets ra on ra.return_id = r.return_id
    join assets a on a.asset_id = ra.asset_id
    where r.order_id = o.order_id
  ) x
) ac on true
where o.order_status <> 'Cancelled';

-- Resellable returns are a stock movement into the chosen location.
create or replace view public.stock_movements as
select purchase_orders.item_id,
       purchase_orders.location_id,
       purchase_orders.received_date as movement_date,
       'IN'::text as direction,
       purchase_orders.quantity,
       purchase_orders.purchase_order_id as reference,
       'Purchase receipt'::text as movement_type
from purchase_orders
where purchase_orders.status = 'Received'
union all
select sales_orders.item_id,
       sales_orders.location_id,
       sales_orders.order_date,
       'OUT'::text,
       sales_orders.quantity,
       sales_orders.order_id,
       'Sales order'::text
from sales_orders
where sales_orders.order_status <> 'Cancelled'
union all
select o.item_id,
       r.location_id,
       r.return_date,
       'IN'::text,
       r.quantity,
       r.return_id,
       'Customer return'::text
from sales_returns r
join sales_orders o on o.order_id = r.order_id
where r.disposition = 'Resellable';
