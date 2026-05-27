/* Seed the vendors table (additive upsert — safe to re-run). Run after
   supabase/orders.sql is applied.  Usage: npx tsx scripts/seed-vendors.ts
   Demo emails use the reserved .example TLD so nothing real is contacted. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const vendors = [
  { name: "Ferrocut Metalworks", email: "orders@ferrocut.example", category: "Cut / bent / laser", default_lead_days: 10, place: "Beverwijk, NL" },
  { name: "Boltkraft", email: "orders@boltkraft.example", category: "Fasteners", default_lead_days: 3, place: "'s-Hertogenbosch, NL" },
  { name: "Pneumacore", email: "order.nl@pneumacore.example", category: "Pneumatics", default_lead_days: 30, place: "Delft, NL" },
  { name: "Glidewerk", email: "nl-sales@glidewerk.example", category: "Motion / cable", default_lead_days: 21, place: "Köln, DE" },
  { name: "Rolcaster", email: "sales@rolcaster.example", category: "Castors", default_lead_days: 14, place: "Rosenfeld, DE" },
  { name: "Extruline BV", email: "sales@extruline.example", category: "Aluminium extrusion", default_lead_days: 18, place: "Eindhoven, NL" },
  { name: "Meridian Machining", email: "shop@meridian.example", category: "Machined parts", default_lead_days: 25, place: "Apeldoorn, NL" },
  { name: "Vaculine", email: "nl@vaculine.example", category: "Vacuum", default_lead_days: 12, place: "Rotterdam, NL" },
];

async function main() {
  const { error } = await db.from("vendors").upsert(vendors, { onConflict: "name" });
  if (error) throw error;
  console.log(`Seeded ${vendors.length} vendors ✓`);
}
main().catch((e) => { console.error(e); process.exit(1); });
