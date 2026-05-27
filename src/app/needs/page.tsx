import { AppShell, ScreenHead } from "@/components/erp";
import { NeedsBoard } from "@/components/needs-board";
import { NotConnected } from "@/components/not-connected";
import { getModules, getOrderItems } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NeedsPage() {
  const [modules, items] = await Promise.all([getModules(), getOrderItems()]);

  return (
    <AppShell>
      <ScreenHead
        title="Needs"
        sub="Capture what each module needs to be built. Pick a module, import its needs from a CSV (or add parts by hand) — the system nets against stock and what's already on order, then drops the real shortfall into the purchasing backlog."
      />
      {!supabaseConfigured || modules.length === 0 ? (
        <NotConnected configured={supabaseConfigured} empty={modules.length === 0} />
      ) : (
        <NeedsBoard modules={modules} items={items} />
      )}
    </AppShell>
  );
}
