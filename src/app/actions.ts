"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { parseCsv, normProcurement } from "@/lib/csv";
import type { BomLinePatch, Procurement } from "@/lib/types";

/* All mutations live here. They run on the server with the service-role client
   and revalidate the affected routes so the UI reflects the new state. */

const PROCUREMENTS: Procurement[] = ["off-shelf", "long-lead", "custom", "laser", "3d-print"];

function revalidateAll() {
  for (const p of ["/", "/bom", "/needs", "/planning", "/purchasing", "/receiving", "/inventory", "/vendors", "/parts"]) revalidatePath(p);
}

function db() {
  const client = supabaseAdmin();
  if (!client) throw new Error("Supabase is not configured (missing env).");
  return client;
}

/** Keep the parts catalogue in sync so BoM ⇄ inventory stays connected. */
async function ensurePart(partNumber: string, fields: { name?: string; procurement?: Procurement; vendor?: string; cost?: number | null }) {
  if (!partNumber.trim()) return;
  const client = db();
  const { data: existing } = await client.from("parts").select("part_number").eq("part_number", partNumber).maybeSingle();
  if (existing) return; // don't clobber catalogue edits
  await client.from("parts").insert({
    part_number: partNumber,
    name: fields.name ?? partNumber,
    default_procurement: fields.procurement ?? "off-shelf",
    default_vendor: fields.vendor ?? "",
    std_cost: fields.cost ?? null,
  });
}

/* ---------- modules ---------- */

export async function addModule(form: FormData) {
  const code = String(form.get("code") ?? "").trim();
  if (!code) return;
  await db().from("modules").insert({
    code,
    name: String(form.get("name") ?? "").trim(),
    system: String(form.get("system") ?? "Brick-laying robot").trim(),
    owner: String(form.get("owner") ?? "").trim(),
    build_qty: Math.max(1, Number(form.get("build_qty") ?? 1)),
  });
  revalidateAll();
}

export async function updateModule(id: string, patch: { code?: string; name?: string; owner?: string; system?: string; build_qty?: number }) {
  await db().from("modules").update(patch).eq("id", id);
  revalidateAll();
}

export async function deleteModule(id: string) {
  await db().from("modules").delete().eq("id", id); // bom_lines cascade
  revalidateAll();
}

/* ---------- BoM lines ---------- */

export async function addBomLine(moduleId: string) {
  const client = db();
  const { data: rows } = await client.from("bom_lines").select("position").eq("module_id", moduleId).order("position", { ascending: false }).limit(1);
  const nextPos = (rows?.[0]?.position ?? 0) + 1;
  await client.from("bom_lines").insert({
    module_id: moduleId,
    pcb: String(nextPos).padStart(3, "0"),
    position: nextPos,
  });
  revalidateAll();
}

export async function updateBomLine(id: string, patch: BomLinePatch) {
  const client = db();
  // Normalise numerics coming from text inputs.
  const clean: Record<string, unknown> = { ...patch };
  if (patch.quantity !== undefined) clean.quantity = Number(patch.quantity) || 0;
  if (patch.unit_cost !== undefined) clean.unit_cost = patch.unit_cost === null ? null : Number(patch.unit_cost);
  if (patch.procurement !== undefined && !PROCUREMENTS.includes(patch.procurement)) delete clean.procurement;

  await client.from("bom_lines").update(clean).eq("id", id);

  // If a part number was set, make sure it exists in the catalogue.
  if (patch.part_number?.trim()) {
    const { data: line } = await client.from("bom_lines").select("*").eq("id", id).maybeSingle();
    if (line) {
      await ensurePart(String(line.part_number), {
        name: String(line.name),
        procurement: line.procurement as Procurement,
        vendor: String(line.vendor),
        cost: line.unit_cost as number | null,
      });
    }
  }
  revalidateAll();
}

export async function duplicateBomLine(id: string) {
  const client = db();
  const { data: line } = await client.from("bom_lines").select("*").eq("id", id).maybeSingle();
  if (!line) return;
  const { data: rows } = await client.from("bom_lines").select("position").eq("module_id", line.module_id).order("position", { ascending: false }).limit(1);
  const nextPos = (rows?.[0]?.position ?? 0) + 1;
  await client.from("bom_lines").insert({
    module_id: line.module_id,
    pcb: String(nextPos).padStart(3, "0"),
    part_number: line.part_number,
    name: line.name,
    revision: line.revision,
    note: line.note,
    quantity: line.quantity,
    state: line.state,
    procurement: line.procurement,
    vendor: line.vendor,
    unit_cost: line.unit_cost,
    position: nextPos,
  });
  revalidateAll();
}

export async function deleteBomLine(id: string) {
  await db().from("bom_lines").delete().eq("id", id);
  revalidateAll();
}

/* ---------- CSV import (CAD export → BoM) ---------- */

const HEADER_MAP: Record<string, keyof BomLinePatch | "pcb"> = {
  pcb: "pcb", item: "pcb", "item no": "pcb", "#": "pcb",
  "part number": "part_number", partnumber: "part_number", "part no": "part_number", pn: "part_number", part: "part_number",
  name: "name", description: "name", desc: "name", title: "name",
  rev: "revision", revision: "revision",
  note: "note", notes: "note", material: "note", remarks: "note",
  qty: "quantity", quantity: "quantity", count: "quantity",
  state: "state",
  procurement: "procurement", source: "procurement", method: "procurement",
  vendor: "vendor", supplier: "vendor",
  cost: "unit_cost", "unit cost": "unit_cost", price: "unit_cost", "unit price": "unit_cost",
};

/** Returns the number of lines imported. */
export async function importBomCsv(moduleId: string, csvText: string): Promise<number> {
  const client = db();
  const rows = parseCsv(csvText);
  if (rows.length < 2) return 0;

  const headers = rows[0].map((h) => HEADER_MAP[h.toLowerCase().trim()]);
  const { data: existing } = await client.from("bom_lines").select("position").eq("module_id", moduleId).order("position", { ascending: false }).limit(1);
  let pos = existing?.[0]?.position ?? 0;

  const inserts = rows.slice(1).map((cells) => {
    const rec: Record<string, unknown> = {};
    headers.forEach((field, i) => {
      if (!field) return;
      const raw = (cells[i] ?? "").trim();
      if (field === "quantity") rec.quantity = Number(raw) || 0;
      else if (field === "unit_cost") rec.unit_cost = raw === "" ? null : Number(raw.replace(/[^0-9.,-]/g, "").replace(",", "."));
      else if (field === "procurement") rec.procurement = normProcurement(raw);
      else if (field === "state") rec.state = raw.toLowerCase().includes("progress") ? "in-progress" : "material";
      else rec[field] = raw;
    });
    pos += 1;
    return {
      module_id: moduleId,
      pcb: (rec.pcb as string) || String(pos).padStart(3, "0"),
      part_number: (rec.part_number as string) ?? "",
      name: (rec.name as string) ?? "",
      revision: (rec.revision as string) || "—",
      note: (rec.note as string) ?? "",
      quantity: (rec.quantity as number) ?? 1,
      state: (rec.state as string) ?? "material",
      procurement: (rec.procurement as string) ?? "off-shelf",
      vendor: (rec.vendor as string) ?? "",
      unit_cost: (rec.unit_cost as number | null) ?? null,
      position: pos,
    };
  });

  if (inserts.length) {
    await client.from("bom_lines").insert(inserts);
    // grow the catalogue
    for (const ins of inserts) {
      if (ins.part_number) await ensurePart(ins.part_number, { name: ins.name, procurement: ins.procurement as Procurement, vendor: ins.vendor, cost: ins.unit_cost });
    }
  }
  revalidateAll();
  return inserts.length;
}

/* ---------- inventory ---------- */

export async function moveStock(partNumber: string, locationId: string, delta: number, kind: "receive" | "withdraw" | "adjust", note: string, who: string) {
  if (!partNumber || !locationId || !delta) return;
  await db().rpc("apply_stock_txn", {
    p_part: partNumber,
    p_loc: locationId,
    p_delta: delta,
    p_kind: kind,
    p_note: note,
    p_who: who,
  });
  revalidateAll();
}

/** Reverse a stock movement by posting a compensating transaction. The original
    stays in the log (audit trail intact); the inverse makes the mistake recoverable. */
export async function undoStockTxn(txnId: string) {
  const client = db();
  const { data: t } = await client.from("stock_txns").select("*").eq("id", txnId).maybeSingle();
  if (!t) return;
  await client.rpc("apply_stock_txn", {
    p_part: t.part_number,
    p_loc: t.location_id,
    p_delta: -Number(t.delta),
    p_kind: "adjust",
    p_note: `Undo of ${t.kind} (${Number(t.delta) > 0 ? "+" : ""}${t.delta})`,
    p_who: "Undo",
  });
  revalidateAll();
}

export async function checkInStock(form: FormData) {
  await moveStock(
    String(form.get("part_number") ?? ""),
    String(form.get("location_id") ?? ""),
    Math.abs(Number(form.get("qty") ?? 0)),
    "receive",
    String(form.get("note") ?? ""),
    String(form.get("who") ?? ""),
  );
}

export async function withdrawStock(form: FormData) {
  await moveStock(
    String(form.get("part_number") ?? ""),
    String(form.get("location_id") ?? ""),
    -Math.abs(Number(form.get("qty") ?? 0)),
    "withdraw",
    String(form.get("note") ?? ""),
    String(form.get("who") ?? ""),
  );
}

/* ---------- parts catalogue ---------- */

export async function updatePart(partNumber: string, patch: { name?: string; category?: string; reorder_point?: number; unit?: string; default_vendor?: string; std_cost?: number | null; purchase_url?: string }) {
  await db().from("parts").update(patch).eq("part_number", partNumber);
  revalidateAll();
}

/** Record a new observed price (history) and make it the current standard cost. */
export async function recordPartPrice(partNumber: string, price: number, vendor: string, note: string) {
  if (!partNumber || !(price >= 0)) return;
  const client = db();
  await client.from("part_prices").insert({ part_number: partNumber, price, vendor, note });
  await client.from("parts").update({ std_cost: price }).eq("part_number", partNumber);
  revalidateAll();
}

/* ---------- robots & production planning ---------- */

export async function addRobot(form: FormData) {
  const code = String(form.get("code") ?? "").trim();
  if (!code) return;
  await db().from("robots").insert({ code, name: String(form.get("name") ?? "").trim() });
  revalidateAll();
}

export async function deleteRobot(id: string) {
  await db().from("robots").delete().eq("id", id); // robot_modules cascade
  revalidateAll();
}

/** Set (upsert) or clear the quantity of a module in a robot. qty 0 removes it. */
export async function setRobotModule(robotId: string, moduleId: string, qty: number) {
  const client = db();
  if (qty <= 0) {
    await client.from("robot_modules").delete().eq("robot_id", robotId).eq("module_id", moduleId);
  } else {
    await client.from("robot_modules").upsert({ robot_id: robotId, module_id: moduleId, qty }, { onConflict: "robot_id,module_id" });
  }
  revalidateAll();
}

/** Explode a build plan (robot → modules → parts), net against stock + on-order,
    and write the shortfall into the purchasing backlog. Replaces any previous
    planning-sourced backlog (module_id null) so re-running doesn't duplicate;
    module-specific needs (from CSV imports) are left untouched. */
export async function planToBacklog(robotQtys: Record<string, number>) {
  const client = db();
  const [{ data: rms }, { data: lines }, { data: parts }, { data: stock }, { data: orders }] = await Promise.all([
    client.from("robot_modules").select("robot_id, module_id, qty"),
    client.from("bom_lines").select("module_id, part_number, name, quantity, procurement, vendor, unit_cost"),
    client.from("parts").select("part_number, name, default_vendor, std_cost"),
    client.from("stock").select("part_number, on_hand"),
    client.from("order_items").select("part_number, qty, status"),
  ]);

  // robot demand → module demand
  const moduleDemand = new Map<string, number>();
  for (const rm of rms ?? []) {
    const n = (robotQtys[rm.robot_id as string] ?? 0) * Number(rm.qty);
    if (n > 0) moduleDemand.set(rm.module_id as string, (moduleDemand.get(rm.module_id as string) ?? 0) + n);
  }

  // module demand → part demand (externally-ordered lines only)
  const partBy = new Map((parts ?? []).map((p: Record<string, unknown>) => [p.part_number as string, p]));
  const demand = new Map<string, { name: string; vendor: string; cost: number | null; qty: number }>();
  for (const l of lines ?? []) {
    if (l.procurement === "3d-print" || !l.part_number) continue;
    const md = moduleDemand.get(l.module_id as string) ?? 0;
    if (md <= 0) continue;
    const need = md * Number(l.quantity);
    const cur = demand.get(l.part_number as string);
    if (cur) cur.qty += need;
    else demand.set(l.part_number as string, { name: l.name as string, vendor: (l.vendor as string) || ((partBy.get(l.part_number as string)?.default_vendor as string) ?? ""), cost: (l.unit_cost as number | null) ?? ((partBy.get(l.part_number as string)?.std_cost as number | null) ?? null), qty: need });
  }

  // net against stock + already on order
  const onHand = new Map<string, number>();
  for (const s of stock ?? []) onHand.set(s.part_number as string, (onHand.get(s.part_number as string) ?? 0) + Number(s.on_hand));
  const onOrder = new Map<string, number>();
  for (const o of orders ?? []) if (o.status === "ordered") onOrder.set(o.part_number as string, (onOrder.get(o.part_number as string) ?? 0) + Number(o.qty));

  // replace previous planning-sourced backlog (module_id null)
  await client.from("order_items").delete().is("module_id", null).eq("status", "backlog");

  const inserts: Record<string, unknown>[] = [];
  for (const [pn, d] of demand) {
    const toOrder = Math.max(0, d.qty - (onHand.get(pn) ?? 0) - (onOrder.get(pn) ?? 0));
    if (toOrder <= 0) continue;
    inserts.push({ module_id: null, part_number: pn, name: d.name, vendor: d.vendor, qty: toOrder, unit_cost: d.cost, status: "backlog", note: "From production plan" });
  }
  if (inserts.length) await client.from("order_items").insert(inserts);
  revalidateAll();
  return inserts.length;
}

export async function addPart(form: FormData) {
  const partNumber = String(form.get("part_number") ?? "").trim();
  if (!partNumber) return;
  await db().from("parts").upsert({
    part_number: partNumber,
    name: String(form.get("name") ?? "").trim() || partNumber,
    category: String(form.get("category") ?? "component").trim(),
    unit: String(form.get("unit") ?? "ea").trim() || "ea",
    reorder_point: Math.max(0, Number(form.get("reorder_point") ?? 0)),
    default_vendor: String(form.get("default_vendor") ?? "").trim(),
    std_cost: form.get("std_cost") ? Number(form.get("std_cost")) : null,
  });
  revalidateAll();
}

/* ---------- vendors ---------- */

export async function addVendor(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  await db().from("vendors").upsert({
    name,
    email: String(form.get("email") ?? "").trim(),
    category: String(form.get("category") ?? "").trim(),
    default_lead_days: Math.max(0, Number(form.get("default_lead_days") ?? 14)),
    place: String(form.get("place") ?? "").trim(),
  });
  revalidateAll();
}

export async function updateVendor(name: string, patch: { email?: string; category?: string; default_lead_days?: number; place?: string; notes?: string }) {
  await db().from("vendors").update(patch).eq("name", name);
  revalidateAll();
}

export async function deleteVendor(name: string) {
  await db().from("vendors").delete().eq("name", name);
  revalidateAll();
}

/* ---------- procurement backlog / orders ---------- */

export async function addBacklogItem(moduleId: string | null, partNumber: string, name: string, vendor: string, qty: number, unitCost: number | null) {
  await db().from("order_items").insert({
    module_id: moduleId,
    part_number: partNumber.trim(),
    name: name.trim(),
    vendor: vendor.trim(),
    qty: Math.max(0, qty),
    unit_cost: unitCost,
    status: "backlog",
  });
  revalidateAll();
}

export async function updateOrderItem(id: string, patch: { qty?: number; vendor?: string; lead_days?: number | null; unit_cost?: number | null; note?: string }) {
  await db().from("order_items").update(patch).eq("id", id);
  revalidateAll();
}

export async function deleteOrderItem(id: string) {
  await db().from("order_items").delete().eq("id", id);
  revalidateAll();
}

/** Mark a set of backlog items as ordered, stamping expected delivery dates.
    leadByItem maps item id → lead days (defaults already applied client-side). */
export async function markOrdered(ids: string[], leadByItem: Record<string, number>) {
  if (!ids.length) return;
  const client = db();
  const now = new Date();
  for (const id of ids) {
    const lead = Math.max(0, leadByItem[id] ?? 14);
    const expected = new Date(now.getTime() + lead * 86400000).toISOString().slice(0, 10);
    await client.from("order_items").update({
      status: "ordered",
      lead_days: lead,
      ordered_at: now.toISOString(),
      expected_at: expected,
    }).eq("id", id);
  }
  revalidateAll();
}

/** Receive an ordered item: mark received and check the stock into a location. */
export async function receiveOrderItem(id: string, locationId: string) {
  const client = db();
  const { data: item } = await client.from("order_items").select("*").eq("id", id).maybeSingle();
  if (!item) return;
  await client.rpc("apply_stock_txn", {
    p_part: item.part_number,
    p_loc: locationId,
    p_delta: Number(item.qty),
    p_kind: "receive",
    p_note: `Received order · ${item.vendor || "vendor"}`,
    p_who: "Receiving",
  });
  await client.from("order_items").update({
    status: "received",
    received_qty: item.qty,
    received_at: new Date().toISOString(),
  }).eq("id", id);
  revalidateAll();
}
