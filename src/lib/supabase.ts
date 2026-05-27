import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Server-only Supabase client using the service-role key. This must never be
   imported into a Client Component — the `server-only` guard turns that into a
   build error. All DB access in this app goes through here.

   We don't generate DB types for this demo, so the client is loosely typed
   (rows validated via our own src/lib/types.ts instead). */

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;
let cached: AnyClient | null = null;

/** Returns the admin client, or null if env isn't configured (so pages can
    render a graceful "not connected" state instead of crashing). */
export function supabaseAdmin(): AnyClient | null {
  if (!url || !serviceKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cached ??= createClient<any, any, any>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const supabaseConfigured = Boolean(url && serviceKey);
