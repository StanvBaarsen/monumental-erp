# Monumental ERP — notes

The thinking behind the demo. The demo is the *argument*; this is the *reasoning*,
the build‑vs‑buy call, the rollout, and the open questions — conclusions from the
interviews folded up here.

Last updated: 2026‑05‑27, after **interview 1** (mechanical engineering).
Status: vibe‑coded demo live on Supabase + Netlify
(`erp.monumental.stanvanbaarsen.nl`).

---

## 1. How the scope changed (be honest about it)

The first‑pass hypothesis (pre‑interview) was a generic four‑pillar ERP —
inventory, purchasing, **finance**, production — modelled around *site
operations* (bricks/mortar flowing to a canal‑wall job, cost booked to a
project). **Interview 1 moved the centre of gravity.** Phil (mech eng) made
clear the real, painful, differentiated need is the **manufacturing supply chain
for building the robots**, not site cost accounting:

- Everything they make/procure now has a **unique, engraved part number** (10
  months ago: "mega chaos", nothing had IDs).
- A robot ≈ **12 modules**, each ~60–70 parts, each **owned by one engineer**.
- CAD auto‑generates a **BoM per module** → exported → rolled into **one shopping
  list** for the buyer (Natalie), who multiplies by build quantity, nets against
  stock, and batches orders by supplier.
- Parts are **purchased** (off‑shelf / long‑lead / custom), **laser‑cut & bent**
  (Taylor Steel — the biggest supplier), or **3D‑printed in‑house**.
- The whole thing runs on **shared spreadsheets + macros**. It does "90 % of the
  job well, the last 10 % badly": **key‑man/robustness risk** (one wrong paste
  silently mutates the shopping list; macros break; 15 people on one sheet),
  **not intuitive** (2–3 weeks to onboard), and **supply‑chain risk** (long‑lead
  items up to 5 weeks block a module if missed).

So **finance was dropped for now** (Stan's call; not this interviewee's domain)
and the demo was rebuilt around the module‑BoM → needs → purchase → receive →
build spine. Treat this as validated direction, not final spec — Natalie (buyer)
and Fran (inventory) are the next two interviews.

---

## 2. What the demo does now

Live, on Supabase (every action persists). Screens:

- **Dashboard** — the spine at a glance: modules, incomplete BoM lines, backlog
  to order, on‑order/overdue, low stock.
- **Bill of materials** — modules + per‑module BoM; **every field inline‑editable
  and persisted**; add/duplicate/delete lines; add/delete modules; **CSV import**
  from a CAD export; live **BoM‑health** (flags missing vendor/cost) — directly
  echoing the "health check" Phil liked.
- **Needs** — *pick a module first*, then **import a needs CSV**. A server‑side
  function **nets each line against stock on hand + what's already on order** and
  drops only the real shortfall into that module's backlog. Shows recently
  ordered/received; add/edit by hand.
- **Purchasing** (Natalie's desk) — backlog **grouped by vendor**, per‑line **lead
  time pre‑filled from the vendor default**, **generates a `mailto:` PO** and
  marks lines ordered with an expected delivery date; tracks "on order".
- **Receiving** — inbound **oldest‑expected‑first**, overdue flagged; one‑click
  check‑in → stock up + order line closed.
- **Check in** — a **guided, idiot‑proof wizard** (search/scan → location → qty →
  confirm with a before→after preview), safe for a part‑timer who's never seen
  the system, logging who did it. This is the concrete answer to "scale Fran".
- **Inventory** — part catalogue (shared with the BoM), stock by location,
  check‑in/withdraw with an **append‑only, undoable transaction log**, low‑stock
  flags. Every movement can be reversed (a compensating entry, audit intact).
- **Vendors** — settings table: email + **default lead time** + category, used to
  draft POs and pre‑fill expected dates.

Deliberately **not** SAP/Oracle‑shaped: low‑admin, flat, fast. The `mailto` PO is
a conscious "tape‑and‑cardboard‑that‑works" choice — meet the buyer where she is
(email) rather than build supplier portals/EDI on day one.

**Robustness (Phil's #1 fear).** On the spreadsheets, one silent paste can wipe a
BoM or mutate the shopping list with no warning, and a 5‑week long‑lead miss
blocks a whole module. So the demo adds guardrails the spreadsheet can't:
confirm‑before‑destroy on every delete (module/line/backlog) and on a re‑import
that would overwrite a module's backlog; a warning when an edit looks destructive
(quantity → 0); and a **visible, undoable** stock history so a mistaken check‑in
is one click to reverse.

---

## 3. The connected data model

Postgres on Supabase. The join key throughout is **`part_number`** — the same
part is a BoM line, a catalogue item, a stock level, and an order line.

```
vendors ─┐
         │ (vendor name, default_lead_days, email)
modules ─┴─< bom_lines >── part_number ──┬── parts ──< stock >── locations
   │  (design: what a module is)         │  (catalogue)    (on-hand by place)
   │                                      │                       │
   └ build_qty                            └────────< order_items >┘  (procurement:
                                                                       backlog →
                                                                       ordered →
                                                                       received)
                                          stock_txns  (append-only movement log)
                                          apply_stock_txn()  (atomic receive/withdraw)
```

- **`order_items`** is the procurement spine: status `backlog → ordered →
  received`, carrying vendor, qty (net of stock), lead_days, expected_at. The
  "needs" import writes backlog; Purchasing flips to ordered (+ expected date);
  Receiving flips to received and posts a `stock_txn`.
- Why an in‑house build earns its keep: the same physical part is simultaneously
  a *design item*, a *thing to buy*, a *stock line*, and a *delivery to chase*.
  Generic SaaS leaves those as four un‑joined records in four tools. The value is
  the join + the netting (don't re‑order what's in stock or already on the way).

---

## 4. Build vs buy vs hybrid

**Hybrid, but build the core.** Interview 1 was explicit: no SAP/Oracle ("a lot
of admin", actively disliked). Keep it low‑admin.

| Layer | Call | Why |
|-------|------|-----|
| **BoM + Needs + Purchasing + Receiving + Inventory** | **Build** | The differentiated, hardware‑specific core. No off‑the‑shelf MRP models "an engineer owns this module's BoM; net it against stock and the print queue". This is where in‑house earns its keep, and where the current spreadsheet pain lives. |
| **Vendor ordering** | **Build thin, integrate later** | Start with `mailto:` POs (zero‑friction, matches today's email habit). Later: supplier APIs / Moneybird purchase invoices. Don't build EDI yet. |
| **Finance / accounting** (ledger, AP/AR, VAT/BTW) | **Buy** | Compliance‑heavy, undifferentiated. **Moneybird** is the NL candidate (MCP connector exists). Let it be the book of record; the ERP feeds it commitments (ordered) and actuals (received), and pulls payment status. |

**Hybrid seam:** `order_items` (ordered = committed spend; received = actuals) is
the object that would sync to Moneybird purchase invoices. Finance was descoped
from the demo but the seam is designed in.

---

## 5. Rollout sequencing

Each module must be useful **standalone** so adoption isn't all‑or‑nothing, and
**capture must beat the spreadsheet it replaces** — especially on the shop floor.

1. **Inventory + part catalogue** — the anchor and fastest standalone win (stop
   losing parts). Owner: **Fran**. The big risk Phil named is "how do we scale
   Fran?" → a **guided check‑in wizard** for students/part‑timers (his explicit
   ask) so they can check parts in without tribal knowledge.
2. **BoM** — engineers own their module BoMs; health flagging surfaces gaps
   before hand‑off. Owner: engineers (the health‑check pattern was already
   home‑grown by "Ceta").
3. **Needs → Purchasing → Receiving** — the procurement loop, replacing the
   fragile shared shopping‑list spreadsheet. Owner: **Natalie**. This is where the
   robustness/key‑man win is biggest.
4. **Finance integration (Moneybird)** — last; its inputs are only trustworthy
   once 1–3 produce clean data.

Migrate the catalogue (parts/vendors) before transactional data. One owner per
module accountable for data quality.

---

## 6. Open questions → next interviews

**Natalie (buyer) — interview 2 candidate**
- How she batches by supplier today; the "separate system" she keeps on top of
  the shopping list — replace it or feed it?
- Multi‑vendor per part / preferred vs backup; partial deliveries & back‑orders.
- Should the ERP draft the email (current `mailto`) or actually send/track it?
- Standard vs actual cost: net at standard cost and reconcile to invoices, or
  only ever show actuals?

**Fran (inventory) — interview 2/3 candidate**
- Check‑in flow, locations (he wants **abbreviation + full name + a location
  list**, not cryptic codes), the barcode scanner he set up.
- "Scale Fran": the wizard check‑in; who's allowed to check in.
- **Fasteners as consumables** — manage by weight/scale or vendor‑managed bins
  (Würth/Fabory auto‑reorder)? Worth single‑supplier lock‑in?

**Cross‑cutting**
- Revision: keep or phase out? The CAD part‑number issuing rule.
- Units of measure (ea / m / kg); lot/serial tracking for long‑lead machine parts.
- Untracked supply & prototypes — how should the system tolerate ad‑hoc?
- Biggest single pain to make day‑one adoption worth it; appetite to *maintain*
  an in‑house build for years.

### Interview 2 (Natalie, purchasing & production planning) — what it adds

Natalie works **one level up** from the engineer and pushes the system from "BoM
+ procurement" toward a light **MRP/DRP** with an **AP/finance** tail. Validated
new direction:

- **Demand from robots, not modules.** Model **robot → modules (qty) → parts** so
  she can enter "10 of robot A, 20 of robot B" and explode to a netted parts
  demand. Today she hand‑sets module counts.
- **Spares as first‑class** (per‑robot/module spare qty + a spares %), flagged
  distinctly and forecast — instead of blind "buy a bit extra" → urgent airfreight.
- **Lead‑time / schedule‑aware purchase sequencing**, spread across months in
  batches (long‑lead items are 2–3 months and >half the BoM: battery, camera,
  CNC, Taylor Steel). Not a flat "buy everything" list.
- **Richer parts data**: purchase link (URL), **current price + price history**
  (she can't tell if a supplier honoured a discount), and a buyer's vendor
  distinct from engineering's OnShape‑suggested supplier.
- **Richer orders → AP**: payment terms per supplier (30‑day vs immediate),
  payable amount, **invoice/paid status**, and **partial receipts** (60 ordered,
  arrives 20 + 5 + …). This is the seam to Moneybird.
- **Withdrawal reason** (production vs other) to keep demand honest and feed the
  spares forecast.
- **Inventory accuracy**: a real movement ledger (we have `stock_txns`) is the
  fix for her ~20% year‑end valuation discrepancy.

Implication for build‑vs‑buy: the **finance tail (AP, invoices, valuation) leans
"buy/integrate" (Moneybird)**; the ERP owns demand→PO→receipt→stock and pushes
payables/actuals across. Sequencing: demand‑planning + spares is the highest‑
leverage next build (it reframes the whole shopping list); AP/invoice tracking
and price history follow.

---

## 7. Honest limitations of the demo

- **Open access, no auth** — fake data, anyone can edit (by design for the demo).
- **`mailto` PO**, not real ordering/EDI; **delivery tracking is status‑only** (no
  carrier integration), as agreed.
- **No partial receipts** yet (receive closes the whole line); no multi‑vendor
  per part; no lot/serial; finance/cost reconciliation out of scope.
- Guardrails use browser confirm dialogs (clear enough for the demo); undo is a
  compensating entry, not a transactional rollback. Good enough; not bank‑grade.
- Seed data and demo vendor emails (`.example`) are illustrative.

---

## 8. Tech / ops

- Next.js 16 (App Router) + Tailwind v4, Monumental house style.
- **Supabase Postgres**, all access **server‑side via the service‑role key**
  (`src/lib/supabase.ts` is `server-only`; reads in `src/lib/db.ts`, writes in
  `src/app/actions.ts` + the `/api/needs/import` route handler / Netlify
  function). The key is never shipped to the client.
- Schema: `supabase/schema.sql` (BoM + inventory) and `supabase/orders.sql`
  (vendors + order_items). Seed: `scripts/seed.ts`, `scripts/seed-vendors.ts`.
- Deployed to **`erp.monumental.stanvanbaarsen.nl`** (Netlify, git‑linked).
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set as Netlify env vars
  (builds + runtime scope). Redeploy to pick up the latest build.
- `npm run build` passes; all routes server‑rendered on demand (live data).
