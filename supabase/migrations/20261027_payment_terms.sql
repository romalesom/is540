-- Payment terms for the partial balance sheet in the financial statements.
-- The data has no payments, so receivables and payables are estimated as the
-- invoices of the last N days before the balance sheet date.
alter table public.app_settings
  add column customer_payment_days integer not null default 30 check (customer_payment_days between 0 and 180),
  add column supplier_payment_days integer not null default 30 check (supplier_payment_days between 0 and 180);
