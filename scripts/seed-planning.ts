/* Seed robots + composition + parts supply-chain data. Additive/idempotent.
   Run after supabase/v3.sql.  Usage: npx tsx scripts/seed-planning.ts */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// robot code → { name, modules: { MODULE_CODE: qty } }
const robots = {
  "FB-1": { name: "Façade bricklayer", modules: { RS1: 1, CRN1: 1, "ARM-U": 1, "ARM-L": 1, GRP1: 1 } },
  "CM-1": { name: "Canal mason", modules: { RS1: 1, CRN1: 2, "ARM-U": 1, "ARM-L": 1, GRP1: 1 } },
} as const;

const purchaseUrls: Record<string, string> = {
  "FIX-SCM6X20": "https://eshop.boltkraft.example/p/scm6x20",
  "GLD-WJ200": "https://glidewerk.example/p/linear-wj200",
  "RLC-160-PU": "https://rolcaster.example/p/castor-160-pu",
  "PNE-DSBC-63": "https://pneumacore.example/p/dsbc-63",
  "VAC-VP20": "https://vaculine.example/p/vacuum-vp20",
};

// part → [{ price, vendor, daysAgo }] oldest first; the last is the current price.
const priceHistory: Record<string, { price: number; vendor: string; daysAgo: number }[]> = {
  "FIX-SCM6X20": [ { price: 0.2, vendor: "Boltkraft", daysAgo: 120 }, { price: 0.18, vendor: "Boltkraft", daysAgo: 20 } ],
  "GLD-WJ200": [ { price: 45, vendor: "Glidewerk", daysAgo: 90 }, { price: 42, vendor: "Glidewerk", daysAgo: 15 } ],
  "RLC-160-PU": [ { price: 32, vendor: "Rolcaster", daysAgo: 100 }, { price: 34, vendor: "Rolcaster", daysAgo: 10 } ],
};

async function main() {
  const { data: mods } = await db.from("modules").select("id, code");
  const idByCode = new Map((mods ?? []).map((m: Record<string, unknown>) => [m.code as string, m.id as string]));

  console.log("Clearing robots…");
  await db.from("robot_modules").delete().neq("robot_id", "00000000-0000-0000-0000-000000000000");
  await db.from("robots").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("Robots + composition…");
  for (const [code, def] of Object.entries(robots)) {
    const { data, error } = await db.from("robots").insert({ code, name: def.name }).select("id").single();
    if (error || !data) throw error ?? new Error("no robot id");
    const robotId = (data as { id: string }).id;
    const rows = Object.entries(def.modules)
      .map(([mc, qty]) => ({ robot_id: robotId, module_id: idByCode.get(mc), qty }))
      .filter((r) => r.module_id);
    await db.from("robot_modules").insert(rows);
  }

  console.log("Purchase links…");
  for (const [pn, url] of Object.entries(purchaseUrls)) {
    await db.from("parts").update({ purchase_url: url }).eq("part_number", pn);
  }

  console.log("Price history…");
  await db.from("part_prices").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  for (const [pn, hist] of Object.entries(priceHistory)) {
    for (const h of hist) {
      await db.from("part_prices").insert({
        part_number: pn, price: h.price, vendor: h.vendor,
        created_at: new Date(Date.now() - h.daysAgo * 86400000).toISOString(),
      });
    }
    // set current standard cost to the latest observed price
    const latest = hist[hist.length - 1];
    await db.from("parts").update({ std_cost: latest.price }).eq("part_number", pn);
  }

  console.log("Done ✓");
}
main().catch((e) => { console.error(e); process.exit(1); });
