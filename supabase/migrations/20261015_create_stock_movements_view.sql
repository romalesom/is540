-- Stock movements per item and location, derived from existing data:
-- received purchase orders are inbound, non-cancelled sales orders are outbound.
-- security_invoker keeps the view behind the same RLS as the base tables.
create view public.stock_movements with (security_invoker = true) as
select item_id, location_id, received_date as movement_date,
       'IN'::text as direction, quantity, purchase_order_id as reference,
       'Purchase receipt'::text as movement_type
from public.purchase_orders where status = 'Received'
union all
select item_id, location_id, order_date, 'OUT'::text, quantity, order_id, 'Sales order'::text
from public.orders where order_status <> 'Cancelled';
