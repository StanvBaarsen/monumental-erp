"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pill, Section } from "@/components/erp";
import { dutchDateTime, money, qty } from "@/lib/format";
import type { ModuleRow, OrderItem } from "@/lib/types";
import { addBacklogItem, deleteOrderItem, updateOrderItem } from "@/app/actions";

export function NeedsBoard({ modules, items }: { modules: ModuleRow[]; items: OrderItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState(modules[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  const selected = modules.find((m) => m.id === selectedId) ?? modules[0];

  const mine = items.filter((i) => i.module_id === selected?.id);
  const backlog = mine.filter((i) => i.status === "backlog");
  const recent = mine.filter((i) => i.status === "ordered" || i.status === "received");
  const backlogValue = backlog.reduce((t, i) => t + i.qty * (i.unit_cost ?? 0), 0);

  async function importCsv(csv: string) {
    if (!selected) return;
    // Re-importing replaces this module's open backlog — warn before overwriting.
    if (backlog.length > 0 && !confirm(`Importing replaces ${selected.code}'s current backlog (${backlog.length} item${backlog.length === 1 ? "" : "s"}). Continue?`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/needs/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleId: selected.id, csv }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setMsg(`Imported ${json.added} part${json.added === 1 ? "" : "s"} into ${selected.code}'s backlog · ${json.coveredByStock} already covered by stock/on-order.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ opacity: pending || busy ? 0.6 : 1, transition: "opacity .15s" }}>
      {/* step 1: pick a module — made explicit */}
      <div className="erp-section">
        <div className="erp-section__head"><h2>1 · Pick a module</h2><span className="count">needs are tracked per module</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", padding: "0 var(--pad-block) var(--pad-block)" }}>
          {modules.map((m) => {
            const n = items.filter((i) => i.module_id === m.id && i.status === "backlog").length;
            const active = m.id === selected?.id;
            return (
              <button
                key={m.id}
                className={active ? "btn" : "btn btn-ghost"}
                style={{ padding: "0.6rem 1rem", fontSize: "0.9rem" }}
                onClick={() => setSelectedId(m.id)}
              >
                {m.code}{n ? ` · ${n}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <>

          {/* step 2: import a needs CSV */}
          <Section title={`2 · Add needs for ${selected.code}`} action={<a className="link arrow" href="/demo-needs.csv" download>Demo CSV</a>}>
            <CsvImport disabled={busy} onImport={importCsv} />
            {msg ? <div style={{ padding: "0 var(--pad-block) var(--pad-block)" }} className="muted">{msg}</div> : null}
            <ManualAdd disabled={pending} onAdd={(pn, name, vendor, q, cost) => run(() => addBacklogItem(selected.id, pn, name, vendor, q, cost))} />
          </Section>

          {/* the module's current backlog */}
          <Section title="To-order backlog" count={`${backlog.length} parts · ${money(backlogValue)}`}>
            <table className="erp-table compact">
              <thead>
                <tr><th>Part</th><th>Vendor</th><th className="num">To order</th><th className="num">Unit</th><th>Note</th><th></th></tr>
              </thead>
              <tbody>
                {backlog.length ? backlog.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{i.part_number}</div></td>
                    <td>{i.vendor || <span className="gap">⚠ vendor</span>}</td>
                    <td className="num">
                      <input key={`${i.id}-${i.qty}`} type="number" min={0} className="cell-input num" defaultValue={i.qty} style={{ maxWidth: "6rem" }}
                        onBlur={(e) => {
                          const v = Math.max(0, Number(e.target.value));
                          if (v === i.qty) return;
                          if (v === 0 && !confirm(`Set ${i.part_number} to 0? Remove it from the backlog instead if it's not needed.`)) { router.refresh(); return; }
                          run(() => updateOrderItem(i.id, { qty: v }));
                        }} />
                    </td>
                    <td className="num">{i.unit_cost === null ? "—" : money(i.unit_cost)}</td>
                    <td className="muted" style={{ fontSize: "0.82rem" }}>{i.note}</td>
                    <td><button className="icon-btn danger" title="Remove from backlog" onClick={() => confirm(`Remove ${i.part_number}${i.name ? ` — ${i.name}` : ""} from the backlog?`) && run(() => deleteOrderItem(i.id))}>✕</button></td>
                  </tr>
                )) : <tr><td className="muted" colSpan={6}>Nothing in the backlog — import a needs CSV or add a part above.</td></tr>}
              </tbody>
            </table>
          </Section>

          {recent.length ? (
            <Section title="Recently ordered / received" count={`${recent.length}`}>
              <table className="erp-table compact">
                <thead><tr><th>Part</th><th>Vendor</th><th className="num">Qty</th><th>Status</th><th>When</th></tr></thead>
                <tbody>
                  {recent.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{i.part_number}</div></td>
                      <td>{i.vendor}</td>
                      <td className="num">{qty(i.qty)}</td>
                      <td>{i.status === "received" ? <Pill tone="ok">Received</Pill> : <Pill tone="info">Ordered</Pill>}</td>
                      <td className="muted" style={{ fontSize: "0.85rem" }}>{i.received_at ? dutchDateTime(i.received_at) : i.ordered_at ? dutchDateTime(i.ordered_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}
        </>
      ) : <div className="detail__empty" style={{ padding: "var(--pad-block)" }}>No modules yet — add one on the Bill of materials screen.</div>}
    </div>
  );
}

function CsvImport({ onImport, disabled }: { onImport: (csv: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className="csv-zone">
      <div className="muted" style={{ fontSize: "0.9rem" }}>
        Paste or upload a needs CSV. The server nets each line against stock on hand and parts already on order, so only the real shortfall lands in the backlog. Headers: part number, name, qty, vendor, cost.
      </div>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"part number,name,qty,vendor,cost\nMN-40001,Bracket,12,Ferrocut Metalworks,11.5"} />
      <div><button className="btn" disabled={disabled || !text.trim()} onClick={() => { onImport(text); }}>Import needs</button></div>
    </div>
  );
}

function ManualAdd({ onAdd, disabled }: { onAdd: (pn: string, name: string, vendor: string, qty: number, cost: number | null) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) return <div style={{ padding: "0 var(--pad-block) var(--pad-block)" }}><button className="btn btn-ghost" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }} onClick={() => setOpen(true)}>+ Add a part manually</button></div>;
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onAdd(String(f.get("pn")), String(f.get("name")), String(f.get("vendor")), Number(f.get("qty")) || 0, f.get("cost") ? Number(f.get("cost")) : null); setOpen(false); }}>
      <label>Part number<input name="pn" required /></label>
      <label>Name<input name="name" /></label>
      <label>Vendor<input name="vendor" /></label>
      <label>Qty<input name="qty" type="number" min={0} defaultValue={1} style={{ width: "6rem" }} /></label>
      <label>Unit cost<input name="cost" type="number" step="any" style={{ width: "7rem" }} /></label>
      <button className="btn" disabled={disabled}>Add</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
