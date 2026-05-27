import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { parseCsv, parseNumber } from "@/lib/csv";

export const dynamic = "force-dynamic";

/* POST /api/needs/import   { moduleId, csv }
   The "needs" intake. Parses a CAD/engineer CSV of parts required for a module,
   then — the useful server-side bit — nets each line against what's already in
   stock and already on order, so the backlog only holds what genuinely needs
   buying right now. Re-importing a module replaces its open backlog (no dupes). */

const FIELD: Record<string, "part_number" | "name" | "qty" | "vendor" | "unit_cost"> = {
  "part number": "part_number", partnumber: "part_number", "part no": "part_number", pn: "part_number", part: "part_number",
  name: "name", description: "name", desc: "name", title: "name",
  qty: "qty", quantity: "qty", need: "qty", needed: "qty", count: "qty",
  vendor: "vendor", supplier: "vendor",
  cost: "unit_cost", "unit cost": "unit_cost", price: "unit_cost",
};

export async function POST(req: Request) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { moduleId, csv } = (await req.json()) as { moduleId?: string; csv?: string };
  if (!moduleId || !csv?.trim()) return NextResponse.json({ error: "moduleId and csv are required" }, { status: 400 });

  const rows = parseCsv(csv);
  if (rows.length < 2) return NextResponse.json({ error: "CSV needs a header row and at least one line" }, { status: 400 });

  const headers = rows[0].map((h) => FIELD[h.toLowerCase().trim()]);

  // Reference data for netting.
  const [{ data: parts }, { data: stock }, { data: orders }] = await Promise.all([
    db.from("parts").select("part_number, name, default_vendor, std_cost"),
    db.from("stock").select("part_number, on_hand"),
    db.from("order_items").select("part_number, qty, status"),
  ]);
  const partBy = new Map((parts ?? []).map((p: Record<string, unknown>) => [p.part_number as string, p]));
  const onHand = new Map<string, number>();
  for (const s of stock ?? []) onHand.set(s.part_number as string, (onHand.get(s.part_number as string) ?? 0) + Number(s.on_hand));
  const onOrder = new Map<string, number>(); // already ordered, not yet received = incoming
  for (const o of orders ?? []) if (o.status === "ordered") onOrder.set(o.part_number as string, (onOrder.get(o.part_number as string) ?? 0) + Number(o.qty));

  // Replace this module's existing OPEN backlog so re-import doesn't duplicate.
  await db.from("order_items").delete().eq("module_id", moduleId).eq("status", "backlog");

  const summary = { added: 0, coveredByStock: 0, vendors: new Set<string>() };
  const inserts: Record<string, unknown>[] = [];

  for (const cells of rows.slice(1)) {
    const rec: Record<string, string> = {};
    headers.forEach((f, i) => { if (f) rec[f] = (cells[i] ?? "").trim(); });
    const partNumber = rec.part_number;
    if (!partNumber) continue;

    const cat = partBy.get(partNumber) as Record<string, unknown> | undefined;
    const needed = parseNumber(rec.qty || "0");
    const have = (onHand.get(partNumber) ?? 0) + (onOrder.get(partNumber) ?? 0);
    const toOrder = Math.max(0, needed - have);

    if (toOrder <= 0) { summary.coveredByStock++; continue; }

    const vendor = rec.vendor || (cat?.default_vendor as string) || "";
    const name = rec.name || (cat?.name as string) || partNumber;
    const unitCost = rec.unit_cost ? parseNumber(rec.unit_cost) : (cat?.std_cost as number | null) ?? null;
    if (vendor) summary.vendors.add(vendor);

    inserts.push({
      module_id: moduleId, part_number: partNumber, name, vendor,
      qty: toOrder, unit_cost: unitCost, status: "backlog",
      note: `Needed ${needed}, ${have} in stock/on-order`,
    });
    summary.added++;
  }

  if (inserts.length) await db.from("order_items").insert(inserts);

  // Make sure any new vendors exist for the vendor-management page.
  for (const v of summary.vendors) {
    const { data: existing } = await db.from("vendors").select("name").eq("name", v).maybeSingle();
    if (!existing) await db.from("vendors").insert({ name: v, default_lead_days: 14 });
  }

  for (const p of ["/", "/needs", "/purchasing", "/vendors"]) revalidatePath(p);
  return NextResponse.json({ ok: true, added: summary.added, coveredByStock: summary.coveredByStock });
}
