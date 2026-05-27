<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Task 1 — Monumental ERP (agent instructions)

This folder is **task 1 of 5** in the Monumental assessment batch. It is a full
copy of the `design-language-demo` house‑style app, so it already boots in
Monumental's blueprint aesthetic.

## Read these first (in this workspace)
- **`../MONUMENTAL-CONTEXT.md`** — the main/shared context file (company, house
  style, conventions, integrations). *This is the central agent instruction file
  every task references.*
- **`HANDOFF.md`** — what was already set up here and how to continue.

## House style — reuse, don't reinvent
Build screens from the existing system: import from `src/components/site.tsx`
(`TopBar`, `Hero`, `GridBand`, `Button`, `Tile`, `Footer`, `PageHead`, `Logo`)
and use the `globals.css` classes (`.frame`, `.cols-3`, `.grid-band`, `.layout`,
`.btn`, etc.). Palette: cream `#FFFDEE` / indigo `#1A024D` / orange `#F74823` /
wine `#721E3C`. Serif display = PP Editorial New; body = Satoshi. Favour hairline
grids over shadowed cards.

## Run
```bash
npm install   # if node_modules isn't present
npm run dev   # http://localhost:3000
```

## Deploy
This folder ships the deploy skill at `.claude/skills/deploy-subdomain/`. Ship to
the agreed subdomain with:
```bash
npx --yes tsx .claude/skills/deploy-subdomain/index.ts erp
```
→ `https://erp.monumental.stanvanbaarsen.nl`. Secrets are in the skill's `.env`
(git‑ignored — never commit it).
