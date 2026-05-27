# Monumental ERP

First-pass ERP demo — Next.js 16 + Tailwind v4, backed by Supabase.

## Install

```bash
npm install
```

## Environment

Create `.env.local` in the project root (git-ignored):

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role key>
```

The service-role key is used **server-side only** and is never exposed to the client.

## Run

```bash
npm run dev    # http://localhost:3000
```

## Database (first run)

Apply the SQL in the Supabase SQL editor, in order: `supabase/schema.sql`,
`supabase/orders.sql`, `supabase/v3.sql`. Then seed:

```bash
npx tsx scripts/seed.ts
npx tsx scripts/seed-vendors.ts
npx tsx scripts/seed-planning.ts
```
