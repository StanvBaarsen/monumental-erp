-- =========================================================================
-- Monumental ERP — BoM + connected inventory schema
-- One spine: a part_number flows  BoM line  →  shopping list (net of stock)
--            →  received into stock  →  withdrawn to build a module.
-- All access is server-side via the service role, so RLS is left off.
-- =========================================================================
create extension if not exists pgcrypto;

-- Physical places stock can live (warehouse aisle, print farm, receiving…).
create table if not exists locations (
  id    text primary key,
  name  text not null,
  kind  text not null default 'warehouse'
        check (kind in ('warehouse','workshop','print-farm','inbound','site')),
  place text not null default ''
);

-- The unified part catalogue. Both BoM lines and stock reference part_number,
-- which is what makes BoM ⇄ inventory connected.
create table if not exists parts (
  part_number         text primary key,
  name                text not null default '',
  category            text not null default 'component',
  unit                text not null default 'ea',
  reorder_point       numeric not null default 0,
  default_procurement text not null default 'off-shelf',
  default_vendor      text not null default '',
  std_cost            numeric,
  serial_tracked      boolean not null default false,
  created_at          timestamptz not null default now()
);

-- A buildable robot sub-assembly, owned by one engineer (the DRI).
create table if not exists modules (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  name       text not null default '',
  system     text not null default '',
  owner      text not null default '',
  build_qty  int  not null default 1,
  created_at timestamptz not null default now()
);

-- One BoM row. Mirrors the engineer's spreadsheet columns; vendor/unit_cost may
-- be null/blank → that's a "completeness gap" surfaced as BoM health.
create table if not exists bom_lines (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references modules(id) on delete cascade,
  pcb         text not null default '',
  part_number text not null default '',
  name        text not null default '',
  revision    text not null default '—',
  note        text not null default '',
  quantity    numeric not null default 1,
  state       text not null default 'material' check (state in ('in-progress','material')),
  procurement text not null default 'off-shelf'
              check (procurement in ('off-shelf','long-lead','custom','laser','3d-print')),
  vendor      text not null default '',
  unit_cost   numeric,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists bom_lines_module_idx on bom_lines(module_id);

-- On-hand quantity of a part at a location (= the live state of inventory).
create table if not exists stock (
  part_number text not null,
  location_id text not null references locations(id),
  on_hand     numeric not null default 0,
  primary key (part_number, location_id)
);

-- Every stock movement, append-only — the check-in / withdraw audit trail.
create table if not exists stock_txns (
  id          uuid primary key default gen_random_uuid(),
  part_number text not null,
  location_id text not null references locations(id),
  delta       numeric not null,
  kind        text not null check (kind in ('receive','withdraw','adjust')),
  note        text not null default '',
  who         text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists stock_txns_part_idx on stock_txns(part_number);

-- Atomic stock movement: upsert the on-hand level and log the transaction.
create or replace function apply_stock_txn(
  p_part text, p_loc text, p_delta numeric,
  p_kind text, p_note text default '', p_who text default ''
) returns void language plpgsql as $$
begin
  insert into stock(part_number, location_id, on_hand)
  values (p_part, p_loc, greatest(0, p_delta))
  on conflict (part_number, location_id)
  do update set on_hand = greatest(0, stock.on_hand + p_delta);

  insert into stock_txns(part_number, location_id, delta, kind, note, who)
  values (p_part, p_loc, p_delta, p_kind, p_note, p_who);
end; $$;
