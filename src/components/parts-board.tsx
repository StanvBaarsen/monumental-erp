"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Section } from "@/components/erp";
import { moneyExact, qty } from "@/lib/format";
import type { BomLine, ModuleRow, Part, PartPrice, StockRow } from "@/lib/types";
import { addPart, recordPartPrice, updatePart } from "@/app/actions";

export function PartsBoard({
  parts, lines, modules, stock, prices,
}: {
  parts: Part[]; lines: BomLine[]; modules: ModuleRow[]; stock: StockRow[]; prices: PartPrice[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const codeOf = new Map(modules.map((m) => [m.id, m.code]));
  const usedBy = (pn: string) => {
    const set = new Set<string>();
    for (const l of lines) if (l.part_number === pn) { const c = codeOf.get(l.module_id); if (c) set.add(c); }
    return [...set];
  };
  const onHand = (pn: string) => stock.filter((s) => s.part_number === pn).reduce((t, s) => t + s.on_hand, 0);
  const pricesOf = (pn: string) => prices.filter((p) => p.part_number === pn); // already asc by date


  function recordPrice(p: Part) {
    const v = window.prompt(`New observed price for ${p.part_number} (current ${p.std_cost ?? "—"}):`, String(p.std_cost ?? ""));
    if (v === null) return;
    const n = Number(v);
    if (!(n >= 0)) return;
    run(() => recordPartPrice(p.part_number, n, p.default_vendor, ""));
  }

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>

      <Section title="Parts catalogue" count={`${parts.length}`} action={<AddPartForm onAdd={(fd) => run(() => addPart(fd))} />}>
        <table className="erp-table compact">
          <thead>
            <tr>
              <th>Part number</th><th>Name</th><th>Vendor</th><th>Link</th>
              <th className="num">Price</th><th>History</th><th className="num">Reorder</th><th className="num">On hand</th><th>Used by</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => {
              const hist = pricesOf(p.part_number);
              const trend = hist.length >= 2 ? hist[hist.length - 1].price - hist[hist.length - 2].price : 0;
              return (
                <tr key={p.part_number}>
                  <td className="mono">{p.part_number}</td>
                  <Cell value={p.name} onCommit={(v) => run(() => updatePart(p.part_number, { name: v }))} />
                  <Cell value={p.default_vendor} placeholder="—" onCommit={(v) => run(() => updatePart(p.part_number, { default_vendor: v }))} />
                  <td>
                    {p.purchase_url ? <a className="link" href={p.purchase_url} target="_blank" rel="noreferrer" title={p.purchase_url}>open ↗</a> : null}
                    <input key={`${p.part_number}-url-${p.purchase_url}`} className="cell-input" style={{ fontSize: "0.78rem", marginTop: p.purchase_url ? "0.2rem" : 0 }} defaultValue={p.purchase_url} placeholder="paste URL"
                      onBlur={(e) => e.target.value !== p.purchase_url && run(() => updatePart(p.part_number, { purchase_url: e.target.value.trim() }))} />
                  </td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {p.std_cost === null ? <span className="gap">—</span> : moneyExact(p.std_cost)}
                    {trend !== 0 ? <span style={{ marginLeft: "0.3rem", color: trend > 0 ? "var(--color-orange)" : "#1f7a4d" }} title={`${trend > 0 ? "up" : "down"} vs previous`}>{trend > 0 ? "▲" : "▼"}</span> : null}
                    <button className="icon-btn" title="Record a new observed price" style={{ width: "1.5rem", height: "1.5rem", marginLeft: "0.4rem", fontSize: "0.8rem" }} onClick={() => recordPrice(p)}>＋</button>
                  </td>
                  <td className="muted" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                    {hist.length ? hist.slice(-3).map((h) => moneyExact(h.price)).join(" → ") : "—"}
                  </td>
                  <td className="num">
                    <input key={`${p.part_number}-rp-${p.reorder_point}`} type="number" min={0} className="cell-input num" style={{ maxWidth: "4.5rem" }} defaultValue={p.reorder_point}
                      onBlur={(e) => Number(e.target.value) !== p.reorder_point && run(() => updatePart(p.part_number, { reorder_point: Math.max(0, Number(e.target.value)) }))} />
                  </td>
                  <td className="num">{qty(onHand(p.part_number))}</td>
                  <td className="muted mono" style={{ fontSize: "0.82rem" }}>{usedBy(p.part_number).join(", ") || "—"}</td>
                </tr>
              );
            })}
            {parts.length === 0 ? <tr><td className="muted" colSpan={9}>No parts yet — add one, or they appear automatically from BoM lines and needs imports.</td></tr> : null}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Cell({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  return (
    <td>
      <input key={value} className="cell-input" defaultValue={value} placeholder={placeholder}
        onBlur={(e) => e.target.value !== value && onCommit(e.target.value)} />
    </td>
  );
}

function AddPartForm({ onAdd }: { onAdd: (fd: FormData) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-ghost" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }} onClick={() => setOpen(true)}>+ Add part</button>;
  return (
    <form className="inline-form" style={{ padding: 0 }} onSubmit={(e) => { e.preventDefault(); onAdd(new FormData(e.currentTarget)); setOpen(false); }}>
      <label>Part number<input name="part_number" required /></label>
      <label>Name<input name="name" /></label>
      <label>Vendor<input name="default_vendor" /></label>
      <label>Reorder<input name="reorder_point" type="number" min={0} defaultValue={0} style={{ width: "5rem" }} /></label>
      <label>Std cost<input name="std_cost" type="number" step="any" style={{ width: "6rem" }} /></label>
      <button className="btn">Add</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
