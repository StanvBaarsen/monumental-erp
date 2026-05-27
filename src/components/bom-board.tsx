"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bar, Section } from "@/components/erp";
import { money } from "@/lib/format";
import {
  isExternal,
  lineIncomplete,
  PROCUREMENT_LABEL,
  type BomLine,
  type BomLinePatch,
  type ModuleRow,
  type Procurement,
} from "@/lib/types";
import {
  addBomLine,
  addModule,
  deleteBomLine,
  deleteModule,
  duplicateBomLine,
  importBomCsv,
  updateBomLine,
  updateModule,
} from "@/app/actions";

const PROC_OPTS = Object.entries(PROCUREMENT_LABEL) as [Procurement, string][];

export function BomBoard({ modules, lines }: { modules: ModuleRow[]; lines: BomLine[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState(modules[0]?.id ?? "");
  const [csvOpen, setCsvOpen] = useState(false);

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const selected = modules.find((m) => m.id === selectedId) ?? modules[0];
  const moduleLines = lines.filter((l) => l.module_id === selected?.id).sort((a, b) => a.position - b.position);
  const incomplete = moduleLines.filter(lineIncomplete).length;
  const health = moduleLines.length ? (moduleLines.length - incomplete) / moduleLines.length : 1;


  function commit(line: BomLine, field: keyof BomLinePatch, raw: string) {
    // Warn before a destructive edit: zeroing a quantity drops the line from the
    // build and shopping math. Cancel snaps the field back to the saved value.
    if (field === "quantity" && (Number(raw) || 0) === 0 && line.quantity !== 0) {
      if (!confirm(`Set ${line.name || line.part_number || "this line"} to quantity 0? It will drop out of the build and shopping list. (Delete the line instead to remove it.)`)) {
        router.refresh();
        return;
      }
    }
    const patch: BomLinePatch = {};
    if (field === "quantity") patch.quantity = Number(raw) || 0;
    else if (field === "unit_cost") patch.unit_cost = raw.trim() === "" ? null : Number(raw);
    else (patch as Record<string, string>)[field] = raw;
    if (field === "part_number") patch.part_number = raw.trim();
    run(() => updateBomLine(line.id, patch));
  }

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>

      {/* module selector + overview, with inline-editable build qty */}
      <Section title="Modules" count={`${modules.length}`} action={<AddModuleForm onAdd={(fd) => run(() => addModule(fd))} />}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Owner</th>
              <th className="num">Build qty</th>
              <th className="num">Lines</th>
              <th style={{ width: "20%" }}>BoM health</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const ml = lines.filter((l) => l.module_id === m.id);
              const inc = ml.filter(lineIncomplete).length;
              const h = ml.length ? (ml.length - inc) / ml.length : 1;
              return (
                <tr
                  key={m.id}
                  className={`clickable${m.id === selected?.id ? " is-selected" : ""}${inc ? " is-alert" : ""}`}
                  onClick={() => setSelectedId(m.id)}
                >
                  <td>
                    <span className="mono">{m.code}</span>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>{m.name}</div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      key={`${m.id}-owner-${m.owner}`}
                      className="cell-input"
                      defaultValue={m.owner}
                      onBlur={(e) => e.target.value !== m.owner && run(() => updateModule(m.id, { owner: e.target.value }))}
                    />
                  </td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <input
                      key={`${m.id}-bq-${m.build_qty}`}
                      type="number"
                      className="cell-input num"
                      defaultValue={m.build_qty}
                      min={1}
                      style={{ maxWidth: "5rem" }}
                      onBlur={(e) => Number(e.target.value) !== m.build_qty && run(() => updateModule(m.id, { build_qty: Math.max(1, Number(e.target.value)) }))}
                    />
                  </td>
                  <td className="num">{ml.length}</td>
                  <td>
                    <Bar fraction={h} />
                    <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
                      {Math.round(h * 100)}% complete{inc ? ` · ${inc} gap${inc > 1 ? "s" : ""}` : ""}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="icon-btn danger" title="Delete module" onClick={() => confirm(`Delete module ${m.code} (${m.name}) and its ${ml.length} BoM line${ml.length === 1 ? "" : "s"}? This cannot be undone.`) && run(() => deleteModule(m.id))}>✕</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {selected ? (
        <Section
          title={`${selected.code} — ${selected.name}`}
          count={`${moduleLines.length} lines · ${Math.round(health * 100)}% complete`}
          action={
            <button className="btn btn-ghost" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }} onClick={() => setCsvOpen((v) => !v)}>
              {csvOpen ? "Close import" : "Import CSV"}
            </button>
          }
        >
          {csvOpen ? <CsvImport moduleCode={selected.code} onImport={(text) => run(() => importBomCsv(selected.id, text))} /> : null}
          <table className="erp-table compact">
            <thead>
              <tr>
                <th style={{ width: "4ch" }}>PCB</th>
                <th>Part number</th>
                <th>Name</th>
                <th style={{ width: "5ch" }}>Rev</th>
                <th>Material / note</th>
                <th className="num" style={{ width: "6ch" }}>Qty</th>
                <th>State</th>
                <th>Procurement</th>
                <th>Vendor</th>
                <th className="num">Unit cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {moduleLines.map((l) => {
                const needsVendor = isExternal(l.procurement) && !l.vendor.trim();
                const needsCost = isExternal(l.procurement) && l.unit_cost === null;
                return (
                  <tr key={l.id} className={lineIncomplete(l) ? "is-alert" : undefined}>
                    <td className="mono muted" title="Auto-assigned row id">{l.pcb}</td>
                    <Txt l={l} f="part_number" commit={commit} className="mono" />
                    <Txt l={l} f="name" commit={commit} />
                    <Txt l={l} f="revision" commit={commit} className="mono" />
                    <Txt l={l} f="note" commit={commit} placeholder="—" />
                    <Num l={l} f="quantity" commit={commit} />
                    <td>
                      <select key={`${l.id}-state-${l.state}`} className="cell-input" defaultValue={l.state} onChange={(e) => commit(l, "state", e.target.value)}>
                        <option value="material">Material</option>
                        <option value="in-progress">In progress</option>
                      </select>
                    </td>
                    <td>
                      <select key={`${l.id}-proc-${l.procurement}`} className="cell-input" defaultValue={l.procurement} onChange={(e) => commit(l, "procurement", e.target.value)}>
                        {PROC_OPTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                    </td>
                    <Txt l={l} f="vendor" commit={commit} className={needsVendor ? "is-empty" : ""} placeholder="⚠ vendor" />
                    <Num l={l} f="unit_cost" commit={commit} placeholder="⚠" empty={needsCost} />
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button className="icon-btn" title="Duplicate" onClick={() => run(() => duplicateBomLine(l.id))}>⧉</button>
                        <button className="icon-btn danger" title="Delete line" onClick={() => confirm(`Delete line ${l.part_number || l.pcb}${l.name ? ` — ${l.name}` : ""}?`) && run(() => deleteBomLine(l.id))}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="detail__actions">
            <button className="btn" onClick={() => run(() => addBomLine(selected.id))}>+ Add line</button>
            {incomplete > 0 ? <span className="muted" style={{ fontSize: "0.9rem" }}>{incomplete} line{incomplete > 1 ? "s" : ""} missing a vendor or cost — flagged before hand-off to purchasing.</span> : <span className="muted" style={{ fontSize: "0.9rem" }}>All lines complete · {procSummary(moduleLines)}</span>}
          </div>
        </Section>
      ) : (
        <div className="detail__empty" style={{ padding: "var(--pad-block)" }}>No modules yet — add one above.</div>
      )}
    </div>
  );
}

/* ---------- editable cells ---------- */
type CommitFn = (l: BomLine, f: keyof BomLinePatch, raw: string) => void;

function Txt({ l, f, commit, className = "", placeholder }: { l: BomLine; f: keyof BomLinePatch; commit: CommitFn; className?: string; placeholder?: string }) {
  const value = String((l[f] as string | number | null) ?? "");
  return (
    <td>
      <input
        key={`${l.id}-${f}-${value}`}
        className={`cell-input ${className}`}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => e.target.value !== value && commit(l, f, e.target.value)}
      />
    </td>
  );
}

function Num({ l, f, commit, placeholder, empty }: { l: BomLine; f: keyof BomLinePatch; commit: CommitFn; placeholder?: string; empty?: boolean }) {
  const raw = l[f] as number | null;
  const value = raw === null || raw === undefined ? "" : String(raw);
  return (
    <td className="num">
      <input
        key={`${l.id}-${f}-${value}`}
        type="number"
        step="any"
        className={`cell-input num ${empty ? "is-empty" : ""}`}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => e.target.value !== value && commit(l, f, e.target.value)}
      />
    </td>
  );
}

function procSummary(lines: BomLine[]): string {
  const ext = lines.filter((l) => isExternal(l.procurement));
  const val = ext.reduce((t, l) => t + (l.unit_cost ?? 0) * l.quantity, 0);
  return `${ext.length} to order (${money(val)}/module), ${lines.length - ext.length} printed in-house`;
}

/* ---------- add module ---------- */
function AddModuleForm({ onAdd }: { onAdd: (fd: FormData) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-ghost" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }} onClick={() => setOpen(true)}>+ Add module</button>;
  return (
    <form
      style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
      onSubmit={(e) => { e.preventDefault(); onAdd(new FormData(e.currentTarget)); setOpen(false); }}
    >
      <input name="code" placeholder="Code" required style={inp} />
      <input name="name" placeholder="Name" style={inp} />
      <input name="owner" placeholder="Owner" style={inp} />
      <input name="build_qty" type="number" min={1} defaultValue={1} style={{ ...inp, width: "5rem" }} />
      <button className="btn" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }}>Add</button>
      <button type="button" className="btn btn-ghost" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }} onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
const inp: React.CSSProperties = { font: "inherit", fontSize: "0.9rem", padding: "0.4rem 0.5rem", border: "1px solid var(--color-indigo)", background: "var(--color-cream)", color: "var(--color-indigo)" };

/* ---------- CSV import ---------- */
function CsvImport({ moduleCode, onImport }: { moduleCode: string; onImport: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="csv-zone">
      <div className="muted" style={{ fontSize: "0.9rem" }}>
        Paste a CAD-exported BoM CSV (or pick a file) for <strong>{moduleCode}</strong>. Recognised headers: part number, name, rev, qty, material/note, procurement, vendor, cost.
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }}
      />
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"part number,name,rev,qty,material,procurement,vendor,cost\nMN-40001,Bracket,A,2,3mm laser,laser,Ferrocut Metalworks,11.5"} />
      <div style={{ display: "flex", gap: "0.6rem" }}>
        <button className="btn" disabled={!text.trim()} onClick={() => { onImport(text); setText(""); }}>Import lines</button>
      </div>
    </div>
  );
}
