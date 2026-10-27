-- Customers and suppliers are maintained in the app and deactivated instead of
-- deleted (orders reference them).
--   Inactive supplier: not offered for new purchase orders; open orders continue.
--   Inactive customer: not offered for new sales orders.

alter table public.customers add column status text not null default 'Active' check (status in ('Active', 'Inactive'));
alter table public.suppliers add column status text not null default 'Active' check (status in ('Active', 'Inactive'));

-- Names identify a business partner in every list, so they stay unique.
create unique index suppliers_supplier_name_key on public.suppliers (lower(supplier_name));
