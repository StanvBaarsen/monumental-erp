import { AppShell, ScreenHead } from "@/components/erp";
import { VendorsBoard } from "@/components/vendors-board";
import { NotConnected } from "@/components/not-connected";
import { getOrderItems, getVendors } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const [vendors, items] = await Promise.all([getVendors(), getOrderItems()]);

  return (
    <AppShell>
      <ScreenHead
        title="Vendors"
        sub="The buyer's vendor settings. Each vendor's email is used to draft purchase orders, and the default lead time pre-fills expected delivery dates when an order is placed. New vendors appear automatically when you import needs."
      />
      {!supabaseConfigured ? (
        <NotConnected configured={supabaseConfigured} empty={false} />
      ) : (
        <VendorsBoard vendors={vendors} items={items} />
      )}
    </AppShell>
  );
}
