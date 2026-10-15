-- frontend_api_v1 (NOT YET APPLIED to Supabase project ijvoiynfbyfdklppiyhp as of 2026-10-15)
-- Purpose: let a local browser frontend (anon key) read data and run business logic via functions.
-- Prototype only: UI role switcher, no real auth -> anon may call the write functions.

-- Validation
alter table public.items add constraint items_id_format check (item_id ~ '^MCH-[0-9]{3}$');
alter table public.items add constraint items_reorder_check check (reorder_point >= 0 and reorder_qty > 0);
alter table public.items add constraint items_model_nonempty check (length(trim(model)) > 0);
alter table public.inventory add constraint inventory_stock_nonneg check (stock_qty >= 0);

-- Read policies
do $$ declare t text; begin
  foreach t in array array['suppliers','locations','customers','items','assets','purchase_orders','orders','inventory','service_history'] loop
    execute format('create policy "proto_read_%1$s" on public.%1$I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
create policy "proto_items_insert" on public.items for insert to anon, authenticated with check (true);
create policy "proto_items_update" on public.items for update to anon, authenticated using (true) with check (true);

-- Views
create or replace view public.v_item_overview as
select i.item_id, i.model, i.category, i.supplier_id, s.supplier_name, i.tracking_mode,
       i.unit_cost_eur, i.sale_price_eur, i.reorder_point, i.reorder_qty, i.status,
       coalesce(st.qty,0)::int as stock_qty,
       coalesce(st.loc, (select o.location_id from public.orders o where o.item_id=i.item_id order by o.order_date desc, o.order_id desc limit 1)) as location_id,
       (coalesce(st.qty,0) * i.unit_cost_eur) as stock_value_eur,
       (coalesce(st.qty,0) <= i.reorder_point) as low_stock
from public.items i
join public.suppliers s on s.supplier_id=i.supplier_id
left join lateral (select sum(v.stock_qty) qty, min(v.location_id) loc from public.v_stock v where v.item_id=i.item_id) st on true;

create or replace view public.v_stock_movements as
select po.received_date as movement_date, po.item_id, po.quantity as qty_change, 'Goods receipt'::text as movement_type, po.purchase_order_id as reference, po.location_id
from public.purchase_orders po where po.status='Received' and po.received_date is not null
union all
select o.order_date, o.item_id, -o.quantity, 'Sale', o.order_id, o.location_id
from public.orders o where o.order_status <> 'Cancelled';

grant select on public.v_item_overview, public.v_stock_movements, public.v_stock, public.v_order_margin to anon, authenticated;

-- Business logic
create or replace function public.place_order(p_item_id text, p_customer_id text, p_qty int)
returns text language plpgsql security definer set search_path = public as $$
declare it public.items%rowtype; avail int; loc text; price numeric; oid text; n int;
begin
  perform pg_advisory_xact_lock(540);
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than 0'; end if;
  select * into it from public.items where item_id=p_item_id for update;
  if not found then raise exception 'Item % not found', p_item_id; end if;
  if it.status <> 'Active' then raise exception 'Item % is discontinued', p_item_id; end if;
  if not exists (select 1 from public.customers where customer_id=p_customer_id) then raise exception 'Customer not found'; end if;
  select coalesce(sum(stock_qty),0) into avail from public.v_stock where item_id=p_item_id;
  if p_qty > avail then raise exception 'Insufficient stock: % available, % requested', avail, p_qty; end if;
  price := it.sale_price_eur * case when p_qty >= 3 and it.tracking_mode='Serialized' then 0.95 else 1 end;
  select coalesce(max(substr(order_id,5)::int),0)+1 into n from public.orders;
  oid := 'ORD-'||lpad(n::text,4,'0');
  if it.tracking_mode='Serialized' then
    select location_id into loc from public.assets where item_id=p_item_id and status='InStock' order by received_date, asset_id limit 1;
  else
    select location_id into loc from public.inventory where item_id=p_item_id order by stock_qty desc limit 1;
  end if;
  insert into public.orders(order_id, order_date, customer_id, item_id, location_id, quantity, unit_price_eur, order_status)
  values (oid, current_date, p_customer_id, p_item_id, loc, p_qty, round(price,2), 'Open');
  if it.tracking_mode='Serialized' then
    update public.assets set status='Sold', order_id=oid, location_id=null
    where asset_id in (select asset_id from public.assets where item_id=p_item_id and status='InStock' order by received_date, asset_id limit p_qty);
  else
    update public.inventory set stock_qty = stock_qty - p_qty where item_id=p_item_id and location_id=loc;
  end if;
  return oid;
end $$;

create or replace function public.set_order_status(p_order_id text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; it public.items%rowtype;
begin
  perform pg_advisory_xact_lock(540);
  select * into o from public.orders where order_id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not ((o.order_status='Open' and p_status in ('Shipped','Cancelled')) or (o.order_status='Shipped' and p_status in ('Delivered','Cancelled'))) then
    raise exception 'Status change % -> % is not allowed', o.order_status, p_status;
  end if;
  if p_status='Cancelled' then
    select * into it from public.items where item_id=o.item_id;
    if it.tracking_mode='Serialized' then
      update public.assets set status='InStock', order_id=null, location_id=o.location_id where order_id=o.order_id;
    else
      insert into public.inventory(item_id, location_id, stock_qty, condition) values (o.item_id, o.location_id, o.quantity, 'New')
      on conflict (item_id, location_id) do update set stock_qty = public.inventory.stock_qty + excluded.stock_qty;
    end if;
  end if;
  update public.orders set order_status=p_status where order_id=p_order_id;
end $$;

create or replace function public.receive_stock(p_item_id text, p_location_id text, p_qty int)
returns text language plpgsql security definer set search_path = public as $$
declare it public.items%rowtype; po text; sfx int := 1; a int; s int; i int;
begin
  perform pg_advisory_xact_lock(540);
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than 0'; end if;
  select * into it from public.items where item_id=p_item_id for update;
  if not found then raise exception 'Item not found'; end if;
  if not exists (select 1 from public.locations where location_id=p_location_id) then raise exception 'Location not found'; end if;
  po := 'PO-'||to_char(current_date,'YYMMDD')||'-'||right(p_item_id,3);
  while exists (select 1 from public.purchase_orders where purchase_order_id=po) loop
    sfx := sfx + 1; po := 'PO-'||to_char(current_date,'YYMMDD')||'-'||right(p_item_id,3)||'-'||sfx;
  end loop;
  insert into public.purchase_orders(purchase_order_id, order_date, supplier_id, item_id, location_id, quantity, unit_cost_eur, expected_date, received_date, status)
  values (po, current_date, it.supplier_id, p_item_id, p_location_id, p_qty, it.unit_cost_eur, current_date, current_date, 'Received');
  if it.tracking_mode='Serialized' then
    select coalesce(max(substr(asset_id,5)::int),0) into a from public.assets;
    select coalesce(max(right(serial_number,4)::int),0) into s from public.assets where item_id=p_item_id;
    for i in 1..p_qty loop
      insert into public.assets(asset_id, item_id, serial_number, location_id, condition, status, purchase_order_id, acquisition_cost_eur, received_date)
      values ('AST-'||lpad((a+i)::text,5,'0'), p_item_id, 'SN-'||right(p_item_id,3)||'-'||lpad((s+i)::text,4,'0'), p_location_id, 'New', 'InStock', po, it.unit_cost_eur, current_date);
    end loop;
  else
    insert into public.inventory(item_id, location_id, stock_qty, condition) values (p_item_id, p_location_id, p_qty, 'New')
    on conflict (item_id, location_id) do update set stock_qty = public.inventory.stock_qty + excluded.stock_qty;
  end if;
  return po;
end $$;

create or replace function public.delete_item(p_item_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.orders where item_id=p_item_id) or exists (select 1 from public.assets where item_id=p_item_id)
     or exists (select 1 from public.purchase_orders where item_id=p_item_id) then
    raise exception 'Item has order/asset history and cannot be deleted. Set its status to Discontinued instead.';
  end if;
  delete from public.inventory where item_id=p_item_id;
  delete from public.items where item_id=p_item_id;
end $$;

create or replace function public.add_service(p_asset_id text, p_date date, p_type text, p_technician text, p_cost numeric, p_outcome text)
returns text language plpgsql security definer set search_path = public as $$
declare n int; sid text;
begin
  perform pg_advisory_xact_lock(541);
  if not exists (select 1 from public.assets where asset_id=p_asset_id) then raise exception 'Asset not found'; end if;
  if p_cost is not null and p_cost < 0 then raise exception 'Cost must not be negative'; end if;
  select coalesce(max(substr(service_id,5)::int),0)+1 into n from public.service_history;
  sid := 'SVC-'||lpad(n::text,4,'0');
  insert into public.service_history(service_id, asset_id, service_date, service_type, technician, cost_eur, outcome, next_service_due)
  values (sid, p_asset_id, p_date, p_type, p_technician, p_cost, p_outcome, p_date + 180);
  return sid;
end $$;

create or replace function public.create_customer(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare n int; cid text;
begin
  perform pg_advisory_xact_lock(542);
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'Customer name is required'; end if;
  if exists (select 1 from public.customers where lower(customer_name)=lower(trim(p_name))) then raise exception 'Customer already exists'; end if;
  select coalesce(max(substr(customer_id,5)::int),0)+1 into n from public.customers;
  cid := 'CUS-'||lpad(n::text,2,'0');
  insert into public.customers(customer_id, customer_name) values (cid, trim(p_name));
  return cid;
end $$;

revoke all on function public.place_order, public.set_order_status, public.receive_stock, public.delete_item, public.add_service, public.create_customer from public;
grant execute on function public.place_order, public.set_order_status, public.receive_stock, public.delete_item, public.add_service, public.create_customer to anon, authenticated;
