import { AppShell, ScreenHead } from "@/components/erp";
import { ReceivingBoard } from "@/components/receiving-board";
import { NotConnected } from "@/components/not-connected";
import { getLocations, getOrderItems } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ReceivingPage() {
  const [ordered, locations] = await Promise.all([getOrderItems("ordered"), getLocations()]);

  return (
    <AppShell>
      <ScreenHead
        title="Receiving"
        sub="What's inbound, oldest expected delivery first. When a delivery lands, check it in — the quantity goes into stock and the order line closes."
      />
      {!supabaseConfigured ? (
        <NotConnected configured={supabaseConfigured} empty={false} />
      ) : (
        <ReceivingBoard ordered={ordered} locations={locations} />
      )}
    </AppShell>
  );
}
