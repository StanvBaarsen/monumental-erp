import { log, retry, DeployError } from "./utils";

const API = "https://api.cloudflare.com/client/v4";

interface CfResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

async function cf<T>(pathStr: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = process.env.CLOUDFLARE_API_TOKEN!;
  const res = await fetch(`${API}${pathStr}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json()) as CfResponse<T>;
  if (!res.ok || !data.success) {
    const detail = (data.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new DeployError(`Cloudflare API ${opts.method ?? "GET"} ${pathStr} → ${res.status}: ${detail || "unknown error"}`);
  }
  return data.result;
}

/**
 * Ensure a CNAME `fqdn → target` exists in the zone. Creates it if missing,
 * updates it if content/proxy differ, no-ops if already correct.
 */
export async function ensureCname(opts: { fqdn: string; target: string; proxied: boolean }): Promise<void> {
  const zone = process.env.CLOUDFLARE_ZONE_ID!;
  log.step(`Cloudflare: ensuring CNAME ${opts.fqdn} → ${opts.target} (proxied: ${opts.proxied})`);

  const existing = await retry("Cloudflare DNS lookup", () =>
    cf<DnsRecord[]>(`/zones/${zone}/dns_records?type=CNAME&name=${encodeURIComponent(opts.fqdn)}`)
  );

  // proxied CNAMEs must use ttl 1 (auto); ttl 1 is also valid for DNS-only.
  const body = { type: "CNAME", name: opts.fqdn, content: opts.target, proxied: opts.proxied, ttl: 1 };

  if (existing.length) {
    const rec = existing[0];
    if (rec.content === opts.target && rec.proxied === opts.proxied) {
      log.success("CNAME already up to date");
      return;
    }
    await retry("Cloudflare DNS update", () =>
      cf(`/zones/${zone}/dns_records/${rec.id}`, { method: "PUT", body })
    );
    log.success("Updated existing CNAME");
  } else {
    await retry("Cloudflare DNS create", () =>
      cf(`/zones/${zone}/dns_records`, { method: "POST", body })
    );
    log.success("Created CNAME");
  }
}
