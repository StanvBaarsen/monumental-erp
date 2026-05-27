"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Section } from "@/components/erp";
import type { OrderItem, Vendor } from "@/lib/types";
import { addVendor, deleteVendor, updateVendor } from "@/app/actions";

export function VendorsBoard({ vendors, items }: { vendors: Vendor[]; items: OrderItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const openByVendor = (name: string) => items.filter((i) => i.vendor === name && i.status !== "received").length;

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>

      <Section title="Vendors" count={`${vendors.length}`} action={<AddVendorForm onAdd={(fd) => run(() => addVendor(fd))} />}>
        <table className="erp-table compact">
          <thead>
            <tr><th>Vendor</th><th>Email</th><th>Category</th><th>Place</th><th className="num">Default lead (days)</th><th className="num">Open items</th><th></th></tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.name} className={!v.email.trim() ? "is-alert" : undefined}>
                <td className="mono">{v.name}</td>
                <Cell value={v.email} placeholder="⚠ no email" onCommit={(val) => run(() => updateVendor(v.name, { email: val }))} empty={!v.email.trim()} />
                <Cell value={v.category} placeholder="—" onCommit={(val) => run(() => updateVendor(v.name, { category: val }))} />
                <Cell value={v.place} placeholder="—" onCommit={(val) => run(() => updateVendor(v.name, { place: val }))} />
                <td className="num">
                  <input key={`${v.name}-${v.default_lead_days}`} type="number" min={0} className="cell-input num" style={{ maxWidth: "5rem" }} defaultValue={v.default_lead_days}
                    onBlur={(e) => Number(e.target.value) !== v.default_lead_days && run(() => updateVendor(v.name, { default_lead_days: Math.max(0, Number(e.target.value)) }))} />
                </td>
                <td className="num">{openByVendor(v.name) || ""}</td>
                <td><button className="icon-btn danger" title="Delete vendor" onClick={() => confirm(`Delete vendor ${v.name}?`) && run(() => deleteVendor(v.name))}>✕</button></td>
              </tr>
            ))}
            {vendors.length === 0 ? <tr><td className="muted" colSpan={7}>No vendors yet — add one, or import a needs CSV (vendors are created automatically).</td></tr> : null}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Cell({ value, placeholder, onCommit, empty }: { value: string; placeholder?: string; onCommit: (v: string) => void; empty?: boolean }) {
  return (
    <td>
      <input key={value} className={`cell-input ${empty ? "is-empty" : ""}`} defaultValue={value} placeholder={placeholder}
        onBlur={(e) => e.target.value !== value && onCommit(e.target.value)} />
    </td>
  );
}

function AddVendorForm({ onAdd }: { onAdd: (fd: FormData) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-ghost" style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }} onClick={() => setOpen(true)}>+ Add vendor</button>;
  return (
    <form className="inline-form" style={{ padding: 0 }} onSubmit={(e) => { e.preventDefault(); onAdd(new FormData(e.currentTarget)); setOpen(false); }}>
      <label>Name<input name="name" required /></label>
      <label>Email<input name="email" type="email" /></label>
      <label>Category<input name="category" /></label>
      <label>Lead days<input name="default_lead_days" type="number" min={0} defaultValue={14} style={{ width: "5rem" }} /></label>
      <button className="btn">Add</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
