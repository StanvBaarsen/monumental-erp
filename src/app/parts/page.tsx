import { AppShell, ScreenHead } from "@/components/erp";
import { PartsBoard } from "@/components/parts-board";
import { NotConnected } from "@/components/not-connected";
import { getBomLines, getModules, getPartPrices, getParts, getStock } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PartsPage() {
  const [parts, lines, modules, stock, prices] = await Promise.all([getParts(), getBomLines(), getModules(), getStock(), getPartPrices()]);

  return (
    <AppShell>
      <ScreenHead
        title="Parts"
        sub="The shared part catalogue. Every BoM line and stock level points at a part here, so this is the single definition of each part — its unit, reorder point, default vendor and standard cost. The 'used by' column shows which modules reference it."
      />
      {!supabaseConfigured || parts.length === 0 ? (
        <NotConnected configured={supabaseConfigured} empty={parts.length === 0} />
      ) : (
        <PartsBoard parts={parts} lines={lines} modules={modules} stock={stock} prices={prices} />
      )}
    </AppShell>
  );
}
