import Link from "next/link";
import { AppShell, Bar, Kpi, Pill, ScreenHead, Section } from "@/components/erp";
import { NotConnected } from "@/components/not-connected";
import { getBomLines, getModules, getOrderItems } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";
import { lineIncomplete } from "@/lib/types";
import { money, qty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [modules, lines, backlog, ordered] = await Promise.all([
    getModules(),
    getBomLines(),
    getOrderItems("backlog"),
    getOrderItems("ordered"),
  ]);

  if (!supabaseConfigured || modules.length === 0) {
    return (
      <AppShell>
        <ScreenHead title="Operations dashboard" sub="Design → needs → purchase → receive → build, on one connected spine." />
        <NotConnected configured={supabaseConfigured} empty={modules.length === 0} />
      </AppShell>
    );
  }

  const incomplete = lines.filter(lineIncomplete).length;
  const backlogValue = backlog.reduce((t, i) => t + i.qty * (i.unit_cost ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = ordered.filter((i) => i.expected_at && i.expected_at < today).length;
  const onOrderValue = ordered.reduce((t, i) => t + i.qty * (i.unit_cost ?? 0), 0);

  return (
    <AppShell>
      <ScreenHead
        title="Operations dashboard"
        sub="One spine from design to the workshop floor: a module's needs are captured, netted against stock, ordered from a vendor, received, then withdrawn to build."
      />

      <div className="kpi-grid k4">
        <Kpi label="Modules" value={modules.length} sub="across the robot system" />
        <Kpi label="Incomplete BoM lines" value={incomplete} sub="missing vendor or cost" alert={incomplete > 0} />
        <Kpi label="To order" value={money(backlogValue)} sub={`${backlog.length} parts in backlog`} alert={backlog.length > 0} />
        <Kpi label="On order" value={money(onOrderValue)} sub={`${ordered.length} order${ordered.length === 1 ? "" : "s"}${overdue ? ` · ${overdue} overdue` : ""}`} alert={overdue > 0} />
      </div>

      <Section title="Bill of materials" count={`${modules.length} modules`} action={<Link className="link arrow" href="/bom">Open BoM</Link>}>
        <table className="erp-table">
          <thead>
            <tr><th>Module</th><th>Owner</th><th className="num">Build qty</th><th className="num">Lines</th><th style={{ width: "22%" }}>BoM health</th></tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const ml = lines.filter((l) => l.module_id === m.id);
              const inc = ml.filter(lineIncomplete).length;
              const h = ml.length ? (ml.length - inc) / ml.length : 1;
              return (
                <tr key={m.id} className={inc ? "is-alert" : undefined}>
                  <td><Link className="link mono" href="/bom">{m.code}</Link><div className="muted" style={{ fontSize: "0.85rem" }}>{m.name}</div></td>
                  <td>{m.owner}</td>
                  <td className="num">{m.build_qty}</td>
                  <td className="num">{ml.length}</td>
                  <td>
                    <Bar fraction={h} />
                    <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>{Math.round(h * 100)}% complete{inc ? ` · ${inc} gap${inc > 1 ? "s" : ""}` : ""}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="To order" count={`${backlog.length} parts · ${money(backlogValue)}`} action={<Link className="link arrow" href="/purchasing">Purchasing desk</Link>}>
        <table className="erp-table">
          <thead>
            <tr><th>Part</th><th>Vendor</th><th className="num">Qty</th><th className="num">Line total</th></tr>
          </thead>
          <tbody>
            {backlog.slice(0, 8).map((i) => (
              <tr key={i.id} className={!i.vendor ? "is-alert" : undefined}>
                <td>{i.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{i.part_number}</div></td>
                <td>{i.vendor || <span className="gap">⚠ vendor</span>}</td>
                <td className="num">{qty(i.qty)}</td>
                <td className="num">{i.unit_cost === null ? "—" : money(i.qty * i.unit_cost)}</td>
              </tr>
            ))}
            {backlog.length === 0 ? <tr><td className="muted" colSpan={4}>Backlog is empty — capture module needs on the <Link className="link" href="/needs">Needs</Link> screen.</td></tr> : null}
          </tbody>
        </table>
      </Section>

      {ordered.length ? (
        <Section title="On order" count={`${ordered.length} awaiting delivery`} action={<Link className="link arrow" href="/receiving">Receiving</Link>}>
          <table className="erp-table">
            <thead><tr><th>Part</th><th>Vendor</th><th className="num">Qty</th><th>Expected</th><th>Status</th></tr></thead>
            <tbody>
              {[...ordered].sort((a, b) => (a.expected_at ?? "").localeCompare(b.expected_at ?? "")).slice(0, 8).map((i) => {
                const od = i.expected_at && i.expected_at < today;
                return (
                  <tr key={i.id} className={od ? "is-alert" : undefined}>
                    <td>{i.name}<div className="muted mono" style={{ fontSize: "0.82rem" }}>{i.part_number}</div></td>
                    <td>{i.vendor}</td>
                    <td className="num">{qty(i.qty)}</td>
                    <td style={{ color: od ? "var(--color-orange)" : undefined }}>{i.expected_at ?? "—"}</td>
                    <td>{od ? <Pill tone="warn">Overdue</Pill> : <Pill tone="info">In transit</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      ) : null}
    </AppShell>
  );
}
