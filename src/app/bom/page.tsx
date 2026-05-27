import { AppShell, ScreenHead } from "@/components/erp";
import { BomBoard } from "@/components/bom-board";
import { NotConnected } from "@/components/not-connected";
import { getBomLines, getModules } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function BomPage() {
  const [modules, lines] = await Promise.all([getModules(), getBomLines()]);

  return (
    <AppShell>
      <ScreenHead
        title="Bill of materials"
        sub="Each robot module carries its own BoM, owned by one engineer. Edit any field inline and it saves; released lines roll up into the shopping list (printed parts go to the print farm). Missing vendors or costs are flagged before anything is ordered."
      />
      {!supabaseConfigured || modules.length === 0 ? (
        <NotConnected configured={supabaseConfigured} empty={modules.length === 0} />
      ) : (
        <BomBoard modules={modules} lines={lines} />
      )}
    </AppShell>
  );
}
