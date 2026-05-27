"use client";

/* =========================================================================
   ERP UI primitives — built on the Monumental house style (site.tsx +
   globals.css). Hairline grids, serif numerals, square corners, no cards.
   ========================================================================= */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo, MegaMark } from "@/components/site";

type NavChild = { href: string; label: string };
type NavGroup = { id: string; label: string; children: NavChild[] };

const HOME = { href: "/", label: "Home" };
const GROUPS: NavGroup[] = [
  { id: "engineering", label: "Engineering", children: [
    { href: "/bom", label: "Bill of materials" },
    { href: "/planning", label: "Planning" },
    { href: "/needs", label: "Needs" },
  ] },
  { id: "orders", label: "Orders", children: [
    { href: "/purchasing", label: "Purchasing" },
    { href: "/receiving", label: "Receiving" },
  ] },
  { id: "inventory", label: "Inventory", children: [
    { href: "/checkin", label: "Check in" },
    { href: "/inventory", label: "Stock" },
  ] },
  { id: "settings", label: "Settings", children: [
    { href: "/vendors", label: "Vendors" },
    { href: "/parts", label: "Parts" },
  ] },
];

/** Full app shell: wordmark bar + left module nav + framed body + ruled rail. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const currentGroup = GROUPS.find((g) => g.children.some((c) => isActive(c.href)));

  // Groups start collapsed; the one holding the current page opens by default.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.id, g.id === currentGroup?.id])),
  );
  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  return (
    <>
      <main className="shell">
        <div className="frame">
          <nav className="topbar">
            <Link className="wordmark" href="/" aria-label="Monumental — home">
              <Logo className="wordmark-logo" />
            </Link>
          </nav>

          <div className="layout">
            <div className="sidebar">
              <nav className="sidebar-nav" aria-label="ERP modules">
                <Link href={HOME.href} aria-current={isActive(HOME.href) ? "page" : undefined}>{HOME.label}</Link>
                {GROUPS.map((g) => {
                  const expanded = !!open[g.id];
                  const hasCurrent = g.id === currentGroup?.id;
                  return (
                    <div key={g.id} className={`nav-group${hasCurrent ? " has-current" : ""}`}>
                      <button
                        type="button"
                        className="nav-group__btn"
                        aria-expanded={expanded}
                        onClick={() => toggle(g.id)}
                      >
                        <span className="nav-group__label">{g.label}</span>
                        <span className="pm" aria-hidden>{expanded ? "−" : "+"}</span>
                      </button>
                      {expanded
                        ? g.children.map((c) => (
                            <Link key={c.href} className="nav-child" href={c.href} aria-current={isActive(c.href) ? "page" : undefined}>
                              {c.label}
                            </Link>
                          ))
                        : null}
                    </div>
                  );
                })}
              </nav>
            </div>

            <div className="layout-body">{children}</div>

            <div className="rail" />
          </div>
        </div>
      </main>
      {/* Slim footer: just the orange banner with the Monumental wordmark. */}
      <footer className="footer erp-footer">
        <div className="shell">
          <MegaMark />
        </div>
      </footer>
    </>
  );
}

/* ---------- small primitives ---------- */

export function ScreenHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="erp-head">
      <h1 className="display">{title}</h1>
      {sub ? <p className="sub">{sub}</p> : null}
    </header>
  );
}

export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="erp-section">
      <div className="erp-section__head">
        <h2>{title}</h2>
        {count ? <span className="count">{count}</span> : action}
      </div>
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className={`kpi${alert ? " kpi--alert" : ""}`}>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{value}</div>
      {sub ? <div className="kpi__sub">{sub}</div> : null}
    </div>
  );
}

type Tone = "ok" | "warn" | "info" | "muted";

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

const PO_TONE: Record<string, Tone> = {
  draft: "muted",
  approved: "info",
  ordered: "warn",
  received: "ok",
};
const WO_TONE: Record<string, Tone> = {
  planned: "muted",
  "in-progress": "warn",
  complete: "ok",
};

export const poPill = (status: string) => <Pill tone={PO_TONE[status] ?? "muted"}>{status}</Pill>;
export const woPill = (status: string) => <Pill tone={WO_TONE[status] ?? "muted"}>{status}</Pill>;

const PROC_TONE: Record<string, Tone> = {
  "off-shelf": "muted",
  "long-lead": "warn",
  custom: "info",
  laser: "info",
  "3d-print": "ok",
};
const PROC_LABEL: Record<string, string> = {
  "off-shelf": "Off-shelf",
  "long-lead": "Long lead",
  custom: "Custom",
  laser: "Laser / bent",
  "3d-print": "3D print",
};
export const procPill = (procurement: string) => (
  <Pill tone={PROC_TONE[procurement] ?? "muted"}>{PROC_LABEL[procurement] ?? procurement}</Pill>
);

/** The house Button is a <Link>; this is its sibling for in-app actions. */
export function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "ghost" | "orange";
  disabled?: boolean;
}) {
  const cls = variant === "ghost" ? "btn btn-ghost" : variant === "orange" ? "btn btn-orange" : "btn";
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** Thin proportion bar — fraction 0..1+, turns orange when over 1 (over budget). */
export function Bar({ fraction }: { fraction: number }) {
  const pct = Math.min(100, Math.round(fraction * 100));
  return (
    <div className={`bar${fraction > 1 ? " over" : ""}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
