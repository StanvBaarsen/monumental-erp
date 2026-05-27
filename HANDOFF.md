# Task 1 — handoff (what's already set up)

Set up by Claude on 2026‑05‑27, before any task work began.

## What this folder is
A full copy of `design-language-demo` (Next.js 16 + Tailwind v4, Monumental
house style) so you can vibe‑code the ERP demo immediately in the right look.

## State
- ✅ House‑style app copies cleanly; `npm run dev` serves the style‑guide /
  landing / article routes as a starting canvas.
- ✅ Own git repo, pushed to GitHub (see below).
- ✅ `deploy-subdomain` skill present in `.claude/skills/`.
- ✅ Deployed (house‑style scaffold) to **`erp.monumental.stanvanbaarsen.nl`** as
  a live starting point — replace its pages with the real ERP screens.
- ⏳ No ERP screens built yet. No interview input yet (3 interviews pending).

## How to continue
1. Read `../MONUMENTAL-CONTEXT.md` (shared context).
2. Build the demo screens using the house‑style components in
   `src/components/site.tsx`.
3. Capture thinking in `NOTES.md`.
4. Redeploy after changes: `npx --yes tsx .claude/skills/deploy-subdomain/index.ts erp`
   (git‑linked, so a push to `main` also rebuilds on Netlify).

## Don't
- Don't commit `.claude/skills/deploy-subdomain/.env` (git‑ignored — holds deploy
  secrets).
- Don't ship Monumental's real photos / fonts beyond the demo without a licence.
