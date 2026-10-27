-- Service revenue: what the customer was charged for a service.
-- cost_eur stays our own cost; service profit = price_eur − cost_eur.
-- A service on a machine that is not at a customer is internal: price 0.

alter table public.service_history
  add column price_eur numeric not null default 0 check (price_eur >= 0);

-- 1) Re-assign migrated services to machines that were already sold on the
--    service date. The original FIFO assignment put 51 of 52 services on
--    machines before their sale, so there was no customer to charge.
--    Services of one machine move together (follow-ups stay on one machine);
--    each target machine is used once; the most recently sold machine of the
--    same model before the first service date is chosen.
do $$
declare
  g record;
  target text;
begin
  create temp table used_assets (asset_id text primary key) on commit drop;
  for g in
    select s.asset_id, a.item_id, min(s.service_date) as first_date
    from service_history s join assets a on a.asset_id = s.asset_id
    where s.service_id <= 'SVC-0052'
    group by s.asset_id, a.item_id
    order by min(s.service_date), s.asset_id
  loop
    select b.asset_id into target
    from assets b join sales_orders o on o.order_id = b.order_id
    where b.item_id = g.item_id and b.status = 'Sold' and o.order_date <= g.first_date
      and b.asset_id not in (select asset_id from used_assets)
    order by o.order_date desc, b.asset_id
    limit 1;
    if target is null then
      target := g.asset_id;  -- no machine at a customer yet: stays internal
    end if;
    insert into used_assets values (target) on conflict do nothing;
    update service_history set asset_id = target where asset_id = g.asset_id and service_id <= 'SVC-0052';
  end loop;
end $$;

-- 2) Dummy revenue for the migrated services: margin on revenue between 4 % and
--    20 %, derived from the service ID so the values are reproducible.
--    price = cost / (1 − margin). Internal services (machine not sold on the
--    service date) are not charged.
update service_history s
set price_eur = case
  when exists (
    select 1 from assets a join sales_orders o on o.order_id = a.order_id
    where a.asset_id = s.asset_id and a.status = 'Sold' and o.order_date <= s.service_date
  )
  then round(s.cost_eur / (1 - (0.04 + 0.16 * ((('x' || substr(md5(s.service_id), 1, 7))::bit(28)::int % 10001) / 10000.0))), 2)
  else 0
end
where s.service_id <= 'SVC-0052' and s.cost_eur is not null;
