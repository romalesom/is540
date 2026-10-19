-- Rename orders → sales_orders so the table name says what it holds
-- (purchase_orders already holds supplier orders).
-- Dependent views (v_order_margin, stock_movements) and foreign keys follow
-- the table automatically; constraint and index names are renamed to match.
alter table public.orders rename to sales_orders;

alter table public.sales_orders rename constraint orders_pkey to sales_orders_pkey;
alter table public.sales_orders rename constraint orders_customer_id_fkey to sales_orders_customer_id_fkey;
alter table public.sales_orders rename constraint orders_item_id_fkey to sales_orders_item_id_fkey;
alter table public.sales_orders rename constraint orders_location_id_fkey to sales_orders_location_id_fkey;
alter table public.sales_orders rename constraint orders_quantity_check to sales_orders_quantity_check;
alter table public.sales_orders rename constraint orders_order_status_check to sales_orders_order_status_check;

alter index public.orders_customer_id_idx rename to sales_orders_customer_id_idx;
alter index public.orders_item_id_idx rename to sales_orders_item_id_idx;
alter index public.orders_location_id_idx rename to sales_orders_location_id_idx;
alter index public.orders_order_date_idx rename to sales_orders_order_date_idx;

-- assets.order_id keeps its name; only its constraint now points at sales_orders.
