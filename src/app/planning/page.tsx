import { AppShell, ScreenHead } from "@/components/erp";
import { PlanningBoard } from "@/components/planning-board";
import { NotConnected } from "@/components/not-connected";
import { getBomLines, getModules, getOrderItems, getParts, getRobotModules, getRobots, getStock } from "@/lib/db";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const [robots, robotModules, modules, lines, parts, stock, ordered] = await Promise.all([
    getRobots(),
    getRobotModules(),
    getModules(),
    getBomLines(),
    getParts(),
    getStock(),
    getOrderItems("ordered"),
  ]);

  return (
    <AppShell>
      <ScreenHead
        title="Production planning"
        sub="Plan from the top down: a robot is made of modules, a module of parts. Say how many of each robot to build and it explodes to the modules and parts you need, nets that against stock and what's already on order, then drops the shortfall into the purchasing backlog."
      />
      {!supabaseConfigured || modules.length === 0 ? (
        <NotConnected configured={supabaseConfigured} empty={modules.length === 0} />
      ) : (
        <PlanningBoard robots={robots} robotModules={robotModules} modules={modules} lines={lines} parts={parts} stock={stock} ordered={ordered} />
      )}
    </AppShell>
  );
}
