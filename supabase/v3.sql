-- =========================================================================
-- Monumental ERP — v3: production planning + parts supply-chain data
-- Run after schema.sql and orders.sql.
-- =========================================================================

-- A robot is composed of modules (one level above the module BoM), so demand
-- can be driven from "build N of robot X" instead of hand-set module counts.
create table if not exists robots (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  name       text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists robot_modules (
  robot_id   uuid references robots(id) on delete cascade,
  module_id  uuid references modules(id) on delete cascade,
  qty        int  not null default 1,
  primary key (robot_id, module_id)
);

-- Buyer supply-chain data on each part: the web-shop / quote link.
alter table parts add column if not exists purchase_url text not null default '';

-- Price observations over time (current price = the latest entry). Lets the
-- buyer see whether a supplier actually honoured a discount.
create table if not exists part_prices (
  id          uuid primary key default gen_random_uuid(),
  part_number text not null,
  price       numeric not null,
  vendor      text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists part_prices_part_idx on part_prices(part_number);
