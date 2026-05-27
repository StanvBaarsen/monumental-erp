import { AppShell, ScreenHead } from "@/components/erp";
import { InventoryBoard } from "@/components/inventory-board";
import { NotConnected } from "@/components/not-connected";
import { getLocations, getParts, getStock, getStockTxns } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [parts, stock, locations, txns] = await Promise.all([
    getParts(),
    getStock(),
    getLocations(),
    getStockTxns(),
  ]);

  return (
    <AppShell>
      <ScreenHead
        title="Inventory"
        sub="The part catalogue is shared with the BoM, so on-hand stock nets straight against what each module needs. Check parts in when they arrive, withdraw them to build — every movement is logged."
      />
      {!supabaseConfigured || parts.length === 0 ? (
        <NotConnected configured={supabaseConfigured} empty={parts.length === 0} />
      ) : (
        <InventoryBoard parts={parts} stock={stock} locations={locations} txns={txns} />
      )}
    </AppShell>
  );
}
