import "server-only";
import { supabaseAdmin } from "./supabase";
import type {
  BomLine,
  Location,
  ModuleRow,
  OrderItem,
  Part,
  PartPrice,
  Robot,
  RobotModule,
  StockRow,
  StockTxn,
  Vendor,
} from "./types";

/* Read layer. Every query degrades to an empty result if Supabase isn't
   reachable yet, so the app renders a "not connected" state rather than 500ing. */

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[db]", e);
    return fallback;
  }
}

export async function getModules(): Promise<ModuleRow[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("modules").select("*").order("code");
    if (error) throw error;
    return (data ?? []) as unknown as ModuleRow[];
  }, []);
}

export async function getBomLines(): Promise<BomLine[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("bom_lines").select("*").order("position");
    if (error) throw error;
    return (data ?? []) as unknown as BomLine[];
  }, []);
}

export async function getParts(): Promise<Part[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("parts").select("*").order("part_number");
    if (error) throw error;
    return (data ?? []) as unknown as Part[];
  }, []);
}

export async function getLocations(): Promise<Location[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("locations").select("*").order("name");
    if (error) throw error;
    return (data ?? []) as unknown as Location[];
  }, []);
}

export async function getStock(): Promise<StockRow[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("stock").select("*");
    if (error) throw error;
    return (data ?? []) as unknown as StockRow[];
  }, []);
}

export async function getStockTxns(limit = 50): Promise<StockTxn[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db
      .from("stock_txns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as unknown as StockTxn[];
  }, []);
}

export async function getVendors(): Promise<Vendor[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("vendors").select("*").order("name");
    if (error) throw error;
    return (data ?? []) as unknown as Vendor[];
  }, []);
}

export async function getRobots(): Promise<Robot[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("robots").select("*").order("code");
    if (error) throw error;
    return (data ?? []) as unknown as Robot[];
  }, []);
}

export async function getRobotModules(): Promise<RobotModule[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("robot_modules").select("*");
    if (error) throw error;
    return (data ?? []) as unknown as RobotModule[];
  }, []);
}

export async function getPartPrices(): Promise<PartPrice[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data, error } = await db.from("part_prices").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PartPrice[];
  }, []);
}

export async function getOrderItems(status?: OrderItem["status"]): Promise<OrderItem[]> {
  return safe(async () => {
    const db = supabaseAdmin();
    if (!db) return [];
    let q = db.from("order_items").select("*");
    if (status) q = q.eq("status", status);
    const { data, error } = await q.order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as OrderItem[];
  }, []);
}
