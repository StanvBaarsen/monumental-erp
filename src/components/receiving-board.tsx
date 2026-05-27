"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pill } from "@/components/erp";
import { qty } from "@/lib/format";
import type { Location, OrderItem } from "@/lib/types";
import { receiveOrderItem } from "@/app/actions";

export function ReceivingBoard({ ordered, locations }: { ordered: OrderItem[]; locations: Location[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dest, setDest] = useState(locations.find((l) => l.kind === "warehouse")?.id ?? locations[0]?.id ?? "");

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const today = new Date().toISOString().slice(0, 10);
  // Oldest expected delivery first — what the receiving desk should chase.
  const rows = [...ordered].sort((a, b) => (a.expected_at ?? "9999").localeCompare(b.expected_at ?? "9999"));

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>

      <div className="erp-section">
        <div className="erp-section__head">
          <h2>Inbound — oldest first</h2>
          <div className="inline-form" style={{ padding: 0, gap: "1rem" }}>
            <a className="btn btn-ghost" href="/checkin" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }}>Guided check-in →</a>
            <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>Receive into
              <select value={dest} onChange={(e) => setDest(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
          </div>
        </div>
        <table className="erp-table compact">
          <thead>
            <tr><th>Expected</th><th>Part</th><th>Vendor</th><th className="num">Qty</th><th>Ordered</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const isOverdue = i.expected_at && i.expected_at < today;
              return (
                <tr key={i.id} className={isOverdue ? "is-alert" : undefined}>
                  <td style={{ color: isOverdue ? "var(--color-orange)" : undefined }}>
                    {i.expected_at ?? "—"} {isOverdue ? <Pill tone="warn">Overdue</Pill> : null}
                  </td>
                  <td>{i.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{i.part_number}</div></td>
                  <td>{i.vendor}</td>
                  <td className="num">{qty(i.qty)}</td>
                  <td className="muted">{i.ordered_at ? i.ordered_at.slice(0, 10) : "—"}</td>
                  <td>
                    <button className="btn" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }} disabled={!dest} onClick={() => run(() => receiveOrderItem(i.id, dest))}>
                      Receive {qty(i.qty)}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td className="muted" colSpan={6}>Nothing inbound — orders placed on the Purchasing desk show up here.</td></tr> : null}
          </tbody>
        </table>
        <div className="detail__actions">
          <span className="muted" style={{ fontSize: "0.9rem" }}>Receiving checks the quantity into stock (logged on Inventory) and closes the order line.</span>
        </div>
      </div>
    </div>
  );
}
