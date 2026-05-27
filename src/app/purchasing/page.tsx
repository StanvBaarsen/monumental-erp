import { AppShell, ScreenHead } from "@/components/erp";
import { PurchasingBoard } from "@/components/purchasing-board";
import { NotConnected } from "@/components/not-connected";
import { getOrderItems, getVendors } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PurchasingPage() {
  const [backlog, ordered, vendors] = await Promise.all([
    getOrderItems("backlog"),
    getOrderItems("ordered"),
    getVendors(),
  ]);

  return (
    <AppShell>
      <ScreenHead
        title="Purchasing"
        sub="The buyer's desk. The backlog is grouped by vendor so each becomes one order. Set a lead time per line (pre-filled from the vendor's default), then generate a ready-to-send email and mark the lines ordered — they move to 'on order' with an expected delivery date."
      />
      {!supabaseConfigured ? (
        <NotConnected configured={supabaseConfigured} empty={false} />
      ) : (
        <PurchasingBoard backlog={backlog} ordered={ordered} vendors={vendors} />
      )}
    </AppShell>
  );
}
