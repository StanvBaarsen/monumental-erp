-- =========================================================================
-- Monumental ERP — procurement tables (run after schema.sql)
-- vendors  : the buyer's vendor settings (email + default lead time)
-- order_items : the procurement backlog & order tracking. Lifecycle:
--               backlog → ordered (email sent) → received (checked in)
-- =========================================================================

create table if not exists vendors (
  name             text primary key,
  email            text not null default '',
  category         text not null default '',
  default_lead_days int not null default 14,
  place            text not null default '',
  notes            text not null default '',
  created_at       timestamptz not null default now()
);

create table if not exists order_items (
  id           uuid primary key default gen_random_uuid(),
  module_id    uuid references modules(id) on delete set null,
  part_number  text not null,
  name         text not null default '',
  vendor       text not null default '',          -- matches vendors.name
  qty          numeric not null default 0,         -- quantity to order (net of stock)
  unit_cost    numeric,
  status       text not null default 'backlog'
               check (status in ('backlog','ordered','received','cancelled')),
  lead_days    int,                                -- set at order time (default from vendor)
  ordered_at   timestamptz,
  expected_at  date,                               -- ordered_at + lead_days
  received_qty numeric not null default 0,
  received_at  timestamptz,
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists order_items_status_idx on order_items(status);
create index if not exists order_items_module_idx on order_items(module_id);
