import { AppShell, ScreenHead } from "@/components/erp";
import { CheckinWizard } from "@/components/checkin-wizard";
import { NotConnected } from "@/components/not-connected";
import { getLocations, getParts, getStock } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const [parts, locations, stock] = await Promise.all([getParts(), getLocations(), getStock()]);

  return (
    <AppShell>
      <ScreenHead
        title="Check in stock"
        sub="A quick, guided way to put parts into stock — safe for anyone, no training needed. Search or scan the part, pick a location, enter the count, and confirm. You'll see the stock change before it's saved, and every movement is logged."
      />
      {!supabaseConfigured || parts.length === 0 ? (
        <NotConnected configured={supabaseConfigured} empty={parts.length === 0} />
      ) : (
        <CheckinWizard parts={parts} locations={locations} stock={stock} />
      )}
    </AppShell>
  );
}
