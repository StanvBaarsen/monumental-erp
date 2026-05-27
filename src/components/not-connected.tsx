/** Shown when Supabase isn't configured yet, or the tables are empty (pre-seed).
    Keeps every screen rendering instead of 500ing while the DB is being set up. */
export function NotConnected({ configured, empty }: { configured: boolean; empty: boolean }) {
  return (
    <section className="erp-section">
      <div style={{ padding: "var(--pad-block)", maxWidth: "70ch" }}>
        <p className="lede" style={{ marginBottom: "1rem" }}>
          {configured ? "Connected to Supabase, but there's no data yet." : "Not connected to Supabase yet."}
        </p>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          {configured
            ? "Apply the schema in supabase/schema.sql, then run the seed (npx tsx scripts/seed.ts). This screen will fill in automatically."
            : "Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server."}
        </p>
        {empty && configured ? (
          <p className="muted" style={{ fontSize: "0.95rem" }}>
            Tip: the tables exist but are empty — the seed loads the robot modules, BoM lines, parts and starting stock.
          </p>
        ) : null}
      </div>
    </section>
  );
}
