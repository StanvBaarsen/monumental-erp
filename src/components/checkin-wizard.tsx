"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { qty as fmtQty } from "@/lib/format";
import type { Location, Part, StockRow } from "@/lib/types";
import { moveStock } from "@/app/actions";

/* A short, safe, step-by-step stock check-in for anyone — including a
   part-timer who's never seen the system. Every step validates, the resulting
   stock change is shown before commit, and it writes through the atomic
   apply_stock_txn RPC with the receiver's name logged. Phil's "scale Fran". */

const STEPS = ["Part", "Location", "Quantity", "Confirm"] as const;

export function CheckinWizard({ parts, locations, stock }: { parts: Part[]; locations: Location[]; stock: StockRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<null | { part: Part; loc: Location; n: number }>(null);

  const [query, setQuery] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [locationId, setLocationId] = useState(locations.find((l) => l.kind === "warehouse")?.id ?? locations[0]?.id ?? "");
  const [amount, setAmount] = useState(1);
  const [who, setWho] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const part = parts.find((p) => p.part_number === partNumber);
  const loc = locations.find((l) => l.id === locationId);
  const onHandHere = useMemo(
    () => stock.find((s) => s.part_number === partNumber && s.location_id === locationId)?.on_hand ?? 0,
    [stock, partNumber, locationId],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parts.slice(0, 8);
    return parts.filter((p) => p.part_number.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [parts, query]);

  function reset() {
    setStep(0); setDone(null); setQuery(""); setPartNumber(""); setAmount(1); setWho("");
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function selectPart(pn: string) { setPartNumber(pn); setStep(1); }

  // A scan (or exact type) of a known part number jumps straight ahead.
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const exact = parts.find((p) => p.part_number.toLowerCase() === query.trim().toLowerCase());
    if (exact) selectPart(exact.part_number);
    else if (matches.length === 1) selectPart(matches[0].part_number);
  }

  function commit() {
    if (!part || !loc || amount <= 0 || !who.trim()) return;
    start(async () => {
      await moveStock(part.part_number, loc.id, Math.abs(amount), "receive", "Checked in (wizard)", who.trim());
      router.refresh();
      setDone({ part, loc, n: Math.abs(amount) });
    });
  }

  if (done) {
    return (
      <div className="erp-section wizard">
        <div className="wiz-done">
          <div className="check">✓</div>
          <h3 className="heading" style={{ fontSize: "1.6rem" }}>Checked in</h3>
          <p>Added <strong>{fmtQty(done.n)} {done.part.unit}</strong> of <strong>{done.part.name}</strong> to <strong>{done.loc.name}</strong>.</p>
          <p className="muted" style={{ fontSize: "0.9rem" }}>Logged to the stock history, by {who.trim()}. You can undo it on Inventory if that wasn&apos;t right.</p>
          <div className="wiz-nav">
            <button className="btn" onClick={reset}>Check in another</button>
            <a className="btn btn-ghost" href="/inventory">View inventory</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-section wizard" style={{ opacity: pending ? 0.6 : 1 }}>
      <div className="wiz-steps">
        {STEPS.map((label, i) => (
          <div key={label} className={i < step ? "done" : i === step ? "current" : "todo"}>
            <span className="num">{i < step ? "✓" : i + 1}</span>{label}
          </div>
        ))}
      </div>

      <div className="wiz-body">
        {step === 0 && (
          <>
            <h3>What are you checking in?</h3>
            <p className="muted" style={{ fontSize: "0.95rem", marginTop: "-0.5rem" }}>Type a name or part number, or scan a label and press Enter.</p>
            <input ref={searchRef} className="wiz-search" autoFocus placeholder="Search or scan… e.g. MN-30120 or “bearing”" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} />
            <div className="wiz-results">
              {matches.map((p) => (
                <button key={p.part_number} className="wiz-result" onClick={() => selectPart(p.part_number)}>
                  <span>{p.name}<br /><span className="muted mono" style={{ fontSize: "0.82rem" }}>{p.part_number}</span></span>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>{p.category}</span>
                </button>
              ))}
              {matches.length === 0 ? <div style={{ padding: "0.9rem" }} className="muted">No matching part. Check the label, or ask for it to be added to the catalogue first.</div> : null}
            </div>
          </>
        )}

        {step === 1 && part && (
          <>
            <h3>Where are you putting it?</h3>
            <p className="muted" style={{ fontSize: "0.95rem", marginTop: "-0.5rem" }}>{part.name} · <span className="mono">{part.part_number}</span></p>
            <div className="wiz-loc">
              {locations.map((l) => (
                <button key={l.id} className={l.id === locationId ? "active" : ""} onClick={() => { setLocationId(l.id); setStep(2); }}>
                  <strong>{l.name}</strong><br /><span className="muted" style={{ fontSize: "0.82rem" }}>{l.place || l.kind}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && part && loc && (
          <>
            <h3>How many?</h3>
            <p className="muted" style={{ fontSize: "0.95rem", marginTop: "-0.5rem" }}>{part.name} → {loc.name}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
              <button className="icon-btn" onClick={() => setAmount((a) => Math.max(1, a - 1))}>−</button>
              <input className="wiz-qty" type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
              <button className="icon-btn" onClick={() => setAmount((a) => a + 1)}>+</button>
              <span className="muted">{part.unit}</span>
            </div>
            <div className="wiz-nav">
              <button className="btn" disabled={amount <= 0} onClick={() => setStep(3)}>Next</button>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            </div>
          </>
        )}

        {step === 3 && part && loc && (
          <>
            <h3>Confirm</h3>
            <div className="wiz-preview">
              <div className="row"><span className="muted">Part</span><span>{part.name} · <span className="mono">{part.part_number}</span></span></div>
              <div className="row"><span className="muted">Location</span><span>{loc.name}</span></div>
              <div className="row">
                <span className="muted">Stock here</span>
                <span><span className="big">{fmtQty(onHandHere)}</span> <span className="arrow-to">→ {fmtQty(onHandHere + Math.abs(amount))}</span> <span className="muted">{part.unit}</span></span>
              </div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7 }}>
              Your name (logged with the movement)
              <input className="wiz-search" style={{ fontSize: "1rem" }} placeholder="e.g. Sam (student)" value={who} onChange={(e) => setWho(e.target.value)} />
            </label>
            <div className="wiz-nav">
              <button className="btn" disabled={pending || !who.trim()} onClick={commit}>Check in {fmtQty(Math.abs(amount))} {part.unit}</button>
              <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
              {!who.trim() ? <span className="muted" style={{ fontSize: "0.85rem" }}>Add your name to confirm.</span> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
