"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Pill, Section } from "@/components/erp";
import { money, qty } from "@/lib/format";
import type { OrderItem, Vendor } from "@/lib/types";
import { markOrdered } from "@/app/actions";

export function PurchasingBoard({ backlog, ordered, vendors }: { backlog: OrderItem[]; ordered: OrderItem[]; vendors: Vendor[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const vendorBy = useMemo(() => new Map(vendors.map((v) => [v.name, v])), [vendors]);

  // Lead days per item, defaulted from the vendor's default lead time.
  const [leads, setLeads] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const it of backlog) init[it.id] = it.lead_days ?? vendorBy.get(it.vendor)?.default_lead_days ?? 14;
    return init;
  });
  const leadFor = (it: OrderItem) => leads[it.id] ?? vendorBy.get(it.vendor)?.default_lead_days ?? 14;

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const groups = groupByVendor(backlog);
  const today = new Date().toISOString().slice(0, 10);

  function order(vendorName: string, items: OrderItem[]) {
    const v = vendorBy.get(vendorName);
    const mailto = buildMailto(v, vendorName, items);
    window.location.href = mailto; // open the buyer's mail client with a drafted PO
    const leadByItem: Record<string, number> = {};
    for (const it of items) leadByItem[it.id] = leadFor(it);
    run(() => markOrdered(items.map((i) => i.id), leadByItem));
  }

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>
      <div className="erp-section" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "1rem var(--pad-block)", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: "0.92rem" }}>Purchase sequencing &amp; cash spread are planned in the production gantt.</span>
        <a className="btn btn-ghost" href="https://sheets.google.com" target="_blank" rel="noreferrer" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }}>Open production gantt (Google Sheets) ↗</a>
      </div>


      {groups.length === 0 ? (
        <div className="detail__empty" style={{ padding: "var(--pad-block)" }}>Backlog is empty — capture needs on the Needs screen first.</div>
      ) : (
        groups.map(([vendorName, items]) => {
          const v = vendorBy.get(vendorName);
          const total = items.reduce((t, i) => t + i.qty * (i.unit_cost ?? 0), 0);
          return (
            <Section
              key={vendorName || "none"}
              title={vendorName || "— no vendor —"}
              count={`${items.length} parts · ${money(total)}`}
              action={
                <button
                  className="btn"
                  style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }}
                  disabled={!vendorName}
                  title={v?.email ? `Email ${v.email}` : "No vendor email on file"}
                  onClick={() => order(vendorName, items)}
                >
                  Email order &amp; mark ordered
                </button>
              }
            >
              {!v?.email && vendorName ? (
                <div className="muted gap" style={{ padding: "0 var(--pad-block) 0.6rem" }}>No email on file for {vendorName} — set one on the Vendors page (the draft will open with an empty recipient).</div>
              ) : null}
              <table className="erp-table compact">
                <thead>
                  <tr><th>Part</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Line total</th><th>Modules / note</th><th className="num">Lead (days)</th></tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{i.part_number}</div></td>
                      <td className="num">{qty(i.qty)}</td>
                      <td className="num">{i.unit_cost === null ? "—" : money(i.unit_cost)}</td>
                      <td className="num">{i.unit_cost === null ? "—" : money(i.qty * i.unit_cost)}</td>
                      <td className="muted" style={{ fontSize: "0.82rem" }}>{i.note}</td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          className="cell-input num"
                          style={{ maxWidth: "5rem" }}
                          value={leadFor(i)}
                          onChange={(e) => setLeads((s) => ({ ...s, [i.id]: Math.max(0, Number(e.target.value)) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          );
        })
      )}

      <Section title="On order" count={`${ordered.length} awaiting delivery`} action={<a className="link arrow" href="/receiving">Go to receiving</a>}>
        <table className="erp-table compact">
          <thead><tr><th>Part</th><th>Vendor</th><th className="num">Qty</th><th>Ordered</th><th>Expected</th><th>Status</th></tr></thead>
          <tbody>
            {[...ordered].sort((a, b) => (a.expected_at ?? "").localeCompare(b.expected_at ?? "")).map((i) => {
              const overdue = i.expected_at && i.expected_at < today;
              return (
                <tr key={i.id} className={overdue ? "is-alert" : undefined}>
                  <td>{i.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{i.part_number}</div></td>
                  <td>{i.vendor}</td>
                  <td className="num">{qty(i.qty)}</td>
                  <td>{i.ordered_at ? i.ordered_at.slice(0, 10) : "—"}</td>
                  <td style={{ color: overdue ? "var(--color-orange)" : undefined }}>{i.expected_at ?? "—"}</td>
                  <td>{overdue ? <Pill tone="warn">Overdue</Pill> : <Pill tone="info">In transit</Pill>}</td>
                </tr>
              );
            })}
            {ordered.length === 0 ? <tr><td className="muted" colSpan={6}>Nothing on order yet.</td></tr> : null}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function groupByVendor(items: OrderItem[]): [string, OrderItem[]][] {
  const sorted = [...items].sort((a, b) => a.vendor.localeCompare(b.vendor) || a.part_number.localeCompare(b.part_number));
  const out: [string, OrderItem[]][] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    if (last && last[0] === item.vendor) last[1].push(item);
    else out.push([item.vendor, [item]]);
  }
  return out;
}

function buildMailto(vendor: Vendor | undefined, vendorName: string, items: OrderItem[]): string {
  const lines = items.map((i) => `  • ${i.qty} × ${i.part_number} — ${i.name}`).join("\n");
  const total = items.reduce((t, i) => t + i.qty * (i.unit_cost ?? 0), 0);
  const subject = `Monumental — purchase order (${vendorName})`;
  const body = [
    `Hi ${vendorName},`,
    ``,
    `Please could you supply the following for Monumental:`,
    ``,
    lines,
    ``,
    `Estimated total: ${money(total)} (ex VAT).`,
    `Ship to: Monumental, Sloterdijk, Amsterdam.`,
    `Please confirm lead time and order acknowledgement.`,
    ``,
    `Thanks,`,
    `Natalie — Procurement, Monumental`,
  ].join("\n");
  return `mailto:${encodeURIComponent(vendor?.email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
