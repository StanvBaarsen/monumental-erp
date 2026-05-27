/* DB row types — mirror the Supabase schema (snake_case columns). */

export type Procurement = "off-shelf" | "long-lead" | "custom" | "laser" | "3d-print";
export type BomState = "in-progress" | "material";
export type LocationKind = "warehouse" | "workshop" | "print-farm" | "inbound" | "site";
export type TxnKind = "receive" | "withdraw" | "adjust";

export interface Location {
  id: string;
  name: string;
  kind: LocationKind;
  place: string;
}

export interface Part {
  part_number: string;
  name: string;
  category: string;
  unit: string;
  reorder_point: number;
  default_procurement: Procurement;
  default_vendor: string;
  std_cost: number | null;
  serial_tracked: boolean;
  purchase_url: string;
}

export interface Robot {
  id: string;
  code: string;
  name: string;
  created_at: string;
}

export interface RobotModule {
  robot_id: string;
  module_id: string;
  qty: number;
}

export interface PartPrice {
  id: string;
  part_number: string;
  price: number;
  vendor: string;
  note: string;
  created_at: string;
}

export interface ModuleRow {
  id: string;
  code: string;
  name: string;
  system: string;
  owner: string;
  build_qty: number;
  created_at: string;
}

export interface BomLine {
  id: string;
  module_id: string;
  pcb: string;
  part_number: string;
  name: string;
  revision: string;
  note: string;
  quantity: number;
  state: BomState;
  procurement: Procurement;
  vendor: string;
  unit_cost: number | null;
  position: number;
  created_at: string;
}

/** The editable columns of a BoM line (everything the engineer fills in). */
export type BomLinePatch = Partial<
  Pick<
    BomLine,
    "pcb" | "part_number" | "name" | "revision" | "note" | "quantity" | "state" | "procurement" | "vendor" | "unit_cost"
  >
>;

export interface StockRow {
  part_number: string;
  location_id: string;
  on_hand: number;
}

export interface StockTxn {
  id: string;
  part_number: string;
  location_id: string;
  delta: number;
  kind: TxnKind;
  note: string;
  who: string;
  created_at: string;
}

export interface Vendor {
  name: string;
  email: string;
  category: string;
  default_lead_days: number;
  place: string;
  notes: string;
}

export type OrderStatus = "backlog" | "ordered" | "received" | "cancelled";

export interface OrderItem {
  id: string;
  module_id: string | null;
  part_number: string;
  name: string;
  vendor: string;
  qty: number;
  unit_cost: number | null;
  status: OrderStatus;
  lead_days: number | null;
  ordered_at: string | null;
  expected_at: string | null;
  received_qty: number;
  received_at: string | null;
  note: string;
  created_at: string;
}

export const PROCUREMENT_LABEL: Record<Procurement, string> = {
  "off-shelf": "Off-shelf",
  "long-lead": "Long lead",
  custom: "Custom",
  laser: "Laser / bent",
  "3d-print": "3D print",
};

/** Externally ordered = everything except in-house 3D printing. */
export const isExternal = (p: Procurement): boolean => p !== "3d-print";

/** A line is incomplete if it's ordered out but missing a vendor or a cost. */
export const lineIncomplete = (l: { procurement: Procurement; vendor: string; unit_cost: number | null }): boolean =>
  isExternal(l.procurement) && (l.vendor.trim() === "" || l.unit_cost === null);
