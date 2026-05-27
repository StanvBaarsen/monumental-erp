"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Section } from "@/components/erp";
import { money, qty } from "@/lib/format";
import type { BomLine, ModuleRow, OrderItem, Part, Robot, RobotModule, StockRow } from "@/lib/types";
import { addRobot, deleteRobot, planToBacklog, setRobotModule } from "@/app/actions";

export function PlanningBoard({
  robots, robotModules, modules, lines, parts, stock, ordered,
}: {
  robots: Robot[]; robotModules: RobotModule[]; modules: ModuleRow[]; lines: BomLine[]; parts: Part[]; stock: StockRow[]; ordered: OrderItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [build, setBuild] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const moduleById = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);
  const modulesOf = (robotId: string) => robotModules.filter((rm) => rm.robot_id === robotId);

  // robot build qty → module demand → part demand (external lines), netted.
  const explosion = useMemo(() => {
    const moduleDemand = new Map<string, number>();
    for (const rm of robotModules) {
      const n = (build[rm.robot_id] ?? 0) * rm.qty;
      if (n > 0) moduleDemand.set(rm.module_id, (moduleDemand.get(rm.module_id) ?? 0) + n);
    }
    const partBy = new Map(parts.map((p) => [p.part_number, p]));
    const onHand = new Map<string, number>();
    for (const s of stock) onHand.set(s.part_number, (onHand.get(s.part_number) ?? 0) + s.on_hand);
    const onOrder = new Map<string, number>();
    for (const o of ordered) onOrder.set(o.part_number, (onOrder.get(o.part_number) ?? 0) + o.qty);

    const partDemand = new Map<string, { name: string; vendor: string; cost: number | null; need: number }>();
    for (const l of lines) {
      if (l.procurement === "3d-print" || !l.part_number) continue;
      const md = moduleDemand.get(l.module_id) ?? 0;
      if (md <= 0) continue;
      const need = md * l.quantity;
      const cur = partDemand.get(l.part_number);
      if (cur) cur.need += need;
      else partDemand.set(l.part_number, { name: l.name, vendor: l.vendor || (partBy.get(l.part_number)?.default_vendor ?? ""), cost: l.unit_cost ?? (partBy.get(l.part_number)?.std_cost ?? null), need });
    }
    const partRows = [...partDemand.entries()].map(([pn, d]) => {
      const toOrder = Math.max(0, d.need - (onHand.get(pn) ?? 0) - (onOrder.get(pn) ?? 0));
      return { pn, ...d, onHand: onHand.get(pn) ?? 0, toOrder };
    }).sort((a, b) => a.vendor.localeCompare(b.vendor) || a.pn.localeCompare(b.pn));

    const moduleRows = [...moduleDemand.entries()].map(([id, n]) => ({ module: moduleById.get(id), n }))
      .filter((r) => r.module).sort((a, b) => a.module!.code.localeCompare(b.module!.code));

    const orderValue = partRows.reduce((t, r) => t + r.toOrder * (r.cost ?? 0), 0);
    return { moduleRows, partRows, orderValue, anyDemand: moduleDemand.size > 0 };
  }, [build, robotModules, lines, parts, stock, ordered, modules, moduleById]);

  function send() {
    setMsg(null);
    start(async () => {
      const n = await planToBacklog(build);
      router.refresh();
      setMsg(`Added ${n} part${n === 1 ? "" : "s"} to the purchasing backlog (net of stock and on-order).`);
    });
  }


  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>

      {/* robot composition */}
      <Section title="Robots — what each is made of" count={`${robots.length}`} action={<AddRobotForm onAdd={(fd) => run(() => addRobot(fd))} />}>
        <table className="erp-table compact">
          <thead><tr><th>Robot</th><th>Modules (qty)</th><th></th></tr></thead>
          <tbody>
            {robots.map((r) => (
              <tr key={r.id}>
                <td><span className="mono">{r.code}</span><div className="muted" style={{ fontSize: "0.82rem" }}>{r.name}</div></td>
                <td><Composition robot={r} rows={modulesOf(r.id)} modules={modules} moduleById={moduleById} onSet={(mid, q) => run(() => setRobotModule(r.id, mid, q))} /></td>
                <td><button className="icon-btn danger" title="Delete robot" onClick={() => confirm(`Delete robot ${r.code}?`) && run(() => deleteRobot(r.id))}>✕</button></td>
              </tr>
            ))}
            {robots.length === 0 ? <tr><td className="muted" colSpan={3}>No robots yet — add one, then add its modules.</td></tr> : null}
          </tbody>
        </table>
      </Section>

      {/* build plan → explosion */}
      <Section title="Build plan" count={explosion.anyDemand ? `${money(explosion.orderValue)} to order` : "enter quantities"}>
        <div className="inline-form" style={{ gap: "1.5rem" }}>
          {robots.map((r) => (
            <label key={r.id}>{r.code}<input type="number" min={0} value={build[r.id] ?? 0} onChange={(e) => setBuild((s) => ({ ...s, [r.id]: Math.max(0, Number(e.target.value)) }))} style={{ width: "5.5rem" }} /></label>
          ))}
          <button className="btn" disabled={!explosion.anyDemand || pending} onClick={send}>Add net parts to backlog</button>
        </div>
        {msg ? <div className="muted" style={{ padding: "0 var(--pad-block) 1rem" }}>{msg}</div> : null}

        {explosion.anyDemand ? (
          <>
            <div className="erp-section__head"><h2 style={{ fontSize: "1.2rem" }}>Modules needed</h2></div>
            <table className="erp-table compact">
              <thead><tr><th>Module</th><th>Name</th><th className="num">Qty needed</th></tr></thead>
              <tbody>
                {explosion.moduleRows.map((r) => (
                  <tr key={r.module!.id}><td className="mono">{r.module!.code}</td><td>{r.module!.name}</td><td className="num">{qty(r.n)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="erp-section__head"><h2 style={{ fontSize: "1.2rem" }}>Parts needed (net of stock + on order)</h2></div>
            <table className="erp-table compact">
              <thead><tr><th>Part</th><th>Vendor</th><th className="num">Demand</th><th className="num">On hand</th><th className="num">To order</th><th className="num">Line total</th></tr></thead>
              <tbody>
                {explosion.partRows.map((r) => (
                  <tr key={r.pn} className={r.toOrder > 0 ? undefined : "muted"}>
                    <td>{r.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{r.pn}</div></td>
                    <td>{r.vendor || "—"}</td>
                    <td className="num">{qty(r.need)}</td>
                    <td className="num">{qty(r.onHand)}</td>
                    <td className="num"><strong>{qty(r.toOrder)}</strong></td>
                    <td className="num">{r.cost === null ? "—" : money(r.toOrder * r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="detail__empty">Enter how many of each robot to build — the modules and parts needed appear here, netted against stock.</div>
        )}
      </Section>
    </div>
  );
}

function Composition({ robot, rows, modules, moduleById, onSet }: { robot: Robot; rows: RobotModule[]; modules: ModuleRow[]; moduleById: Map<string, ModuleRow>; onSet: (moduleId: string, qty: number) => void }) {
  const have = new Set(rows.map((r) => r.module_id));
  const addable = modules.filter((m) => !have.has(m.id));
  const [addId, setAddId] = useState("");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
      {rows.map((rm) => (
        <span key={rm.module_id} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          {moduleById.get(rm.module_id)?.code}
          <input type="number" min={0} value={rm.qty} onChange={(e) => onSet(rm.module_id, Math.max(0, Number(e.target.value)))} style={{ width: "3.2rem", font: "inherit", border: "1px solid var(--color-indigo)", background: "var(--color-cream)", color: "var(--color-indigo)", padding: "0.1rem 0.2rem" }} />
          <button className="icon-btn danger" title="Remove" style={{ width: "1.4rem", height: "1.4rem" }} onClick={() => onSet(rm.module_id, 0)}>×</button>
        </span>
      ))}
      {addable.length ? (
        <span style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center" }}>
          <select value={addId} onChange={(e) => setAddId(e.target.value)} style={{ font: "inherit", fontSize: "0.85rem", padding: "0.25rem", border: "1px solid var(--color-indigo)", background: "var(--color-cream)" }}>
            <option value="">+ module…</option>
            {addable.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
          </select>
          {addId ? <button className="icon-btn" title="Add" onClick={() => { onSet(addId, 1); setAddId(""); }}>+</button> : null}
        </span>
      ) : null}
    </div>
  );
}

function AddRobotForm({ onAdd }: { onAdd: (fd: FormData) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-ghost" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }} onClick={() => setOpen(true)}>+ Add robot</button>;
  return (
    <form className="inline-form" style={{ padding: 0 }} onSubmit={(e) => { e.preventDefault(); onAdd(new FormData(e.currentTarget)); setOpen(false); }}>
      <label>Code<input name="code" required /></label>
      <label>Name<input name="name" /></label>
      <button className="btn">Add</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
