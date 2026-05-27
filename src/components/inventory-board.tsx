"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pill, Section } from "@/components/erp";
import { moneyExact, qty, dutchDateTime } from "@/lib/format";
import type { Location, Part, StockRow, StockTxn } from "@/lib/types";
import { moveStock, undoStockTxn } from "@/app/actions";

export function InventoryBoard({
  parts,
  stock,
  locations,
  txns,
}: {
  parts: Part[];
  stock: StockRow[];
  locations: Location[];
  txns: StockTxn[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedPn, setSelectedPn] = useState(parts[0]?.part_number ?? "");
  const selected = parts.find((p) => p.part_number === selectedPn) ?? parts[0];

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const onHand = (pn: string) => stock.filter((s) => s.part_number === pn).reduce((t, s) => t + s.on_hand, 0);

  const selLocations = selected ? stock.filter((s) => s.part_number === selected.part_number) : [];
  const selTotal = selected ? onHand(selected.part_number) : 0;
  const selTxns = selected ? txns.filter((t) => t.part_number === selected.part_number).slice(0, 8) : [];
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>

      <div className="master-detail">
        <div className="master">
          <table className="erp-table">
            <thead>
              <tr><th>Part</th><th className="num">On hand</th><th>Status</th></tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const oh = onHand(p.part_number);
                const low = oh < p.reorder_point;
                return (
                  <tr key={p.part_number} className={`clickable${p.part_number === selectedPn ? " is-selected" : ""}${low ? " is-alert" : ""}`} onClick={() => setSelectedPn(p.part_number)}>
                    <td>{p.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{p.part_number}</div></td>
                    <td className="num">{qty(oh)} {p.unit}</td>
                    <td>{low ? <Pill tone="warn">Low</Pill> : <Pill tone="ok">In stock</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="detail">
          {selected ? (
            <>
              <div className="detail__head">
                <div className="eyebrow muted">{selected.category} · {selected.part_number}</div>
                <div className="detail__title" style={{ marginTop: "0.5rem" }}>{selected.name}</div>
              </div>
              <div className="detail__row"><span className="k">Total on hand</span><span className="v">{qty(selTotal)} {selected.unit}</span></div>
              <div className="detail__row"><span className="k">Reorder point</span><span className="v">{qty(selected.reorder_point)}</span></div>
              <div className="detail__row"><span className="k">Standard cost</span><span className="v">{selected.std_cost === null ? "—" : moneyExact(selected.std_cost)}</span></div>
              <div className="detail__row"><span className="k">Default vendor</span><span className="v">{selected.default_vendor || "—"}</span></div>

              <div className="erp-section__head"><h2 style={{ fontSize: "1.2rem" }}>On hand by location</h2></div>
              <table className="erp-table">
                <tbody>
                  {selLocations.length ? selLocations.map((s) => (
                    <tr key={s.location_id}><td>{locName(s.location_id)}</td><td className="num">{qty(s.on_hand)} {selected.unit}</td></tr>
                  )) : <tr><td className="muted">No stock on hand.</td><td></td></tr>}
                </tbody>
              </table>

              <MoveForm part={selected.part_number} locations={locations} onMove={(loc, delta, kind) => run(() => moveStock(selected.part_number, loc, delta, kind, kind === "receive" ? "Checked in" : "Withdrawn to build", kind === "receive" ? "Receiving" : "Workshop"))} />

              <div className="erp-section__head"><h2 style={{ fontSize: "1.2rem" }}>Recent movements</h2></div>
              <table className="erp-table">
                <tbody>
                  {selTxns.length ? selTxns.map((t) => (
                    <tr key={t.id}>
                      <td>{dutchDateTime(t.created_at)}<div className="muted" style={{ fontSize: "0.8rem" }}>{t.note}</div></td>
                      <td>{locName(t.location_id)}</td>
                      <td className="num" style={{ color: t.delta < 0 ? "var(--color-orange)" : undefined }}>{t.delta > 0 ? "+" : ""}{qty(t.delta)}</td>
                    </tr>
                  )) : <tr><td className="muted">No movements yet.</td><td></td><td></td></tr>}
                </tbody>
              </table>
            </>
          ) : <div className="detail__empty">No parts yet.</div>}
        </div>
      </div>

      <Section title="Recent activity" count={`${txns.length} movements`}>
        <table className="erp-table">
          <thead>
            <tr><th>When</th><th>Part</th><th>Location</th><th>Kind</th><th className="num">Change</th><th>Note</th><th></th></tr>
          </thead>
          <tbody>
            {txns.slice(0, 15).map((t) => (
              <tr key={t.id}>
                <td>{dutchDateTime(t.created_at)}</td>
                <td className="mono">{t.part_number}</td>
                <td>{locName(t.location_id)}</td>
                <td>{t.kind === "receive" ? <Pill tone="ok">Receive</Pill> : t.kind === "withdraw" ? <Pill tone="warn">Withdraw</Pill> : <Pill tone="muted">Adjust</Pill>}</td>
                <td className="num" style={{ color: t.delta < 0 ? "var(--color-orange)" : undefined }}>{t.delta > 0 ? "+" : ""}{qty(t.delta)}</td>
                <td className="muted">{t.note}</td>
                <td>
                  {t.who !== "Undo" ? (
                    <button className="icon-btn" title="Undo this movement" onClick={() => confirm(`Undo this ${t.kind} of ${t.delta > 0 ? "+" : ""}${t.delta}? A reversing movement will be logged.`) && run(() => undoStockTxn(t.id))}>↩</button>
                  ) : null}
                </td>
              </tr>
            ))}
            {txns.length === 0 ? <tr><td className="muted" colSpan={7}>No movements yet — check parts in or withdraw to build.</td></tr> : null}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function MoveForm({ part, locations, onMove }: { part: string; locations: Location[]; onMove: (loc: string, delta: number, kind: "receive" | "withdraw") => void }) {
  const [loc, setLoc] = useState(locations[0]?.id ?? "");
  const [amount, setAmount] = useState(1);
  return (
    <div className="inline-form" key={part}>
      <label>Location<select value={loc} onChange={(e) => setLoc(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Quantity<input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))} style={{ width: "6rem" }} /></label>
      <button className="btn" onClick={() => onMove(loc, Math.abs(amount), "receive")}>Check in</button>
      <button className="btn btn-ghost" onClick={() => onMove(loc, Math.abs(amount), "withdraw")}>Withdraw</button>
    </div>
  );
}
