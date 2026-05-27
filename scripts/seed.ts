/* Seed the Supabase database with the robot-module BoM + connected inventory.
   Idempotent: clears the tables and re-inserts. Run AFTER schema.sql is applied.

   Usage:  npx tsx scripts/seed.ts
   (loads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local) */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// --- load .env.local (tsx doesn't do this automatically) ---
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const locations = [
  { id: "WH", name: "Main warehouse", kind: "warehouse", place: "Workshop, ground floor" },
  { id: "A3", name: "Aisle A · bay 3", kind: "warehouse", place: "Workshop, ground floor" },
  { id: "PRINT", name: "Print farm", kind: "print-farm", place: "Workshop, ground floor" },
  { id: "INB", name: "Inbound / receiving", kind: "inbound", place: "Workshop, ground floor" },
];

type Line = {
  pcb: string; part_number: string; name: string; revision: string; note: string;
  quantity: number; state: "in-progress" | "material"; procurement: string; vendor: string; unit_cost: number | null;
};
const M = (code: string, name: string, owner: string, build_qty: number, lines: Line[]) => ({ code, name, owner, build_qty, lines });
const L = (
  pcb: string, part_number: string, name: string, revision: string, note: string,
  quantity: number, state: Line["state"], procurement: string, vendor: string, unit_cost: number | null,
): Line => ({ pcb, part_number, name, revision, note, quantity, state, procurement, vendor, unit_cost });

const modules = [
  M("RS1", "Supply wagon chassis", "Salar", 6, [
    L("001", "MN-30114", "Chassis side panel", "C", "3mm S235 laser + bent", 2, "material", "laser", "Ferrocut Metalworks", 38),
    L("002", "MN-30115", "Cross member", "B", "40×40 box, mitre", 4, "material", "laser", "Ferrocut Metalworks", 12.5),
    L("003", "FIX-SCM6X20", "M6×20 socket cap screw", "—", "A2 stainless", 48, "material", "off-shelf", "Boltkraft", 0.18),
    L("004", "MN-30120", "Castor mount bracket", "A", "", 4, "material", "3d-print", "Print farm", 1.4),
    L("005", "RLC-160-PU", "Heavy-duty castor Ø160", "—", "", 4, "material", "off-shelf", "Rolcaster", 34),
    L("006", "MN-30131", "Battery tray weldment", "A", "tube stock — supplier struggles w/ cut", 1, "in-progress", "long-lead", "Ferrocut Metalworks", null),
  ]),
  M("CRN1", "Crane — main boom", "Wouter", 4, [
    L("001", "MN-31002", "Boom extrusion 1.8m", "D", "anodised 6082-T6", 1, "material", "long-lead", "Extruline BV", 210),
    L("002", "MN-31010", "Boom end cap", "B", "", 2, "material", "3d-print", "Print farm", 2.1),
    L("003", "MN-31021", "Slew bearing mount plate", "B", "12mm, laser + tapped", 1, "material", "laser", "Ferrocut Metalworks", 56),
    L("004", "PNE-DSBC-63", "Pneumatic actuator Ø63", "—", "5-week lead", 2, "material", "long-lead", "Pneumacore", 365),
    L("005", "FIX-SCM6X20", "M6×20 socket cap screw", "—", "A2 stainless", 32, "material", "off-shelf", "Boltkraft", 0.18),
    L("006", "MN-31044", "Cable carrier bracket", "A", "", 2, "in-progress", "custom", "", null),
  ]),
  M("ARM-U", "Upper arm", "Phil", 4, [
    L("001", "MN-32005", "Upper arm link", "E", "machined billet", 1, "material", "custom", "Meridian Machining", 480),
    L("002", "GLD-WJ200", "Linear bearing carriage", "—", "", 2, "material", "off-shelf", "Glidewerk", 42),
    L("003", "MN-32018", "Encoder shroud", "A", "", 1, "material", "3d-print", "Print farm", 3.2),
    L("004", "FIX-SCM6X20", "M6×20 socket cap screw", "—", "A2 stainless", 24, "material", "off-shelf", "Boltkraft", 0.18),
    L("005", "MN-32030", "Joint cover plate", "B", "2mm laser", 2, "material", "laser", "Ferrocut Metalworks", 9.5),
  ]),
  M("ARM-L", "Lower arm", "Jo-An", 4, [
    L("001", "MN-33004", "Lower arm link", "D", "machined billet", 1, "material", "custom", "Meridian Machining", 455),
    L("002", "GLD-WJ200", "Linear bearing carriage", "—", "", 2, "material", "off-shelf", "Glidewerk", 42),
    L("003", "MN-33019", "Wrist flange", "A", "", 1, "in-progress", "custom", "Meridian Machining", null),
    L("004", "FIX-SCM6X20", "M6×20 socket cap screw", "—", "A2 stainless", 24, "material", "off-shelf", "Boltkraft", 0.18),
  ]),
  M("GRP1", "Brick gripper head", "Sebas", 8, [
    L("001", "MN-34002", "Gripper frame", "C", "5mm laser + bent", 1, "material", "laser", "Ferrocut Metalworks", 44),
    L("002", "MN-34010", "Vacuum pad mount", "B", "", 4, "material", "3d-print", "Print farm", 0.9),
    L("003", "VAC-VP20", "Vacuum pad Ø20", "—", "", 4, "material", "off-shelf", "Vaculine", 6.8),
    L("004", "PNE-VG-10", "Vacuum generator", "—", "", 1, "material", "off-shelf", "Pneumacore", 78),
    L("005", "FIX-SCM6X20", "M6×20 socket cap screw", "—", "A2 stainless", 16, "material", "off-shelf", "Boltkraft", 0.18),
    L("006", "MN-34033", "Compliance spring kit", "A", "", 1, "in-progress", "off-shelf", "", 24),
  ]),
];

// Initial on-hand, so the shopping list nets against real stock.
const stock = [
  { part_number: "FIX-SCM6X20", location_id: "WH", on_hand: 300 },
  { part_number: "GLD-WJ200", location_id: "WH", on_hand: 6 },
  { part_number: "RLC-160-PU", location_id: "WH", on_hand: 4 },
  { part_number: "PNE-VG-10", location_id: "WH", on_hand: 1 },
  { part_number: "MN-30120", location_id: "PRINT", on_hand: 12 },
];

const REORDER: Record<string, number> = { "FIX-SCM6X20": 200, "GLD-WJ200": 8, "RLC-160-PU": 6 };

function categoryFor(proc: string): string {
  if (proc === "3d-print") return "in-house print";
  if (proc === "laser") return "fabricated";
  if (proc === "custom" || proc === "long-lead") return "machined";
  return "off-shelf";
}

async function main() {
  console.log("Clearing…");
  await db.from("stock_txns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("stock").delete().neq("part_number", "");
  await db.from("bom_lines").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("modules").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("parts").delete().neq("part_number", "");
  await db.from("locations").delete().neq("id", "");

  console.log("Locations…");
  await db.from("locations").insert(locations);

  // Build the parts catalogue from every distinct BoM part_number.
  const parts = new Map<string, Record<string, unknown>>();
  for (const m of modules) {
    for (const l of m.lines) {
      if (!parts.has(l.part_number)) {
        parts.set(l.part_number, {
          part_number: l.part_number,
          name: l.name,
          category: categoryFor(l.procurement),
          unit: "ea",
          reorder_point: REORDER[l.part_number] ?? 0,
          default_procurement: l.procurement,
          default_vendor: l.vendor,
          std_cost: l.unit_cost,
          serial_tracked: l.procurement === "long-lead",
        });
      }
    }
  }
  console.log(`Parts… (${parts.size})`);
  await db.from("parts").insert([...parts.values()]);

  console.log("Modules + BoM lines…");
  for (const m of modules) {
    const { data, error } = await db
      .from("modules")
      .insert({ code: m.code, name: m.name, system: "Brick-laying robot", owner: m.owner, build_qty: m.build_qty })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("no module id");
    const moduleId = (data as { id: string }).id;
    await db.from("bom_lines").insert(
      m.lines.map((l, i) => ({ ...l, module_id: moduleId, position: i + 1 })),
    );
  }

  console.log("Stock…");
  await db.from("stock").insert(stock);

  console.log("Done ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
