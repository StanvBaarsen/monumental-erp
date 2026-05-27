import fs from "node:fs";
import path from "node:path";
import { run, log, retry, DeployError } from "./utils";

const API = "https://api.netlify.com/api/v1";

export interface NetlifySite {
  siteId: string;
  siteName: string;
  /** e.g. "birds-1234.netlify.app" — the CNAME target for custom domains */
  netlifyHost: string;
}

interface NetlifySiteResponse {
  id: string;
  name: string;
  url: string;
  ssl_url?: string;
  default_domain?: string;
  custom_domain?: string;
}

/* ------------------------------------------------------------------ *
 * REST helper
 * ------------------------------------------------------------------ */

async function api<T = any>(
  pathStr: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = process.env.NETLIFY_AUTH_TOKEN!;
  const res = await fetch(`${API}${pathStr}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new DeployError(`Netlify API ${opts.method ?? "GET"} ${pathStr} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return data as T;
}

function hostFromSite(site: NetlifySiteResponse): string {
  if (site.default_domain) return site.default_domain;
  return (site.url ?? site.ssl_url ?? "").replace(/^https?:\/\//, "");
}

/* ------------------------------------------------------------------ *
 * Site create / reuse
 * ------------------------------------------------------------------ */

/** Reuse the site recorded in .netlify/state.json, find one by name, or create one. */
export async function ensureSite(opts: { cwd: string; siteName: string }): Promise<NetlifySite> {
  log.step("Netlify: resolving target site");
  const stateFile = path.join(opts.cwd, ".netlify", "state.json");

  // 1. Reuse linked site from local state (most reliable rerun path).
  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (state.siteId) {
        const site = await api<NetlifySiteResponse>(`/sites/${state.siteId}`);
        log.success(`Reusing linked site from .netlify/state.json: ${site.name} (${site.id})`);
        return { siteId: site.id, siteName: site.name, netlifyHost: hostFromSite(site) };
      }
    } catch (e) {
      log.warn(`.netlify/state.json present but unusable (${(e as Error).message}); will resolve by name`);
    }
  }

  // 2. Look for an existing site with this name (idempotent re-create).
  const found = await api<NetlifySiteResponse[]>(`/sites?name=${encodeURIComponent(opts.siteName)}`);
  const exact = Array.isArray(found) ? found.find((s) => s.name === opts.siteName) : undefined;
  if (exact) {
    log.success(`Found existing Netlify site by name: ${exact.name} (${exact.id})`);
    writeState(opts.cwd, exact.id);
    return { siteId: exact.id, siteName: exact.name, netlifyHost: hostFromSite(exact) };
  }

  // 3. Create a new site.
  log.info(`Creating new Netlify site "${opts.siteName}"`);
  const created = await retry("Netlify site create", () =>
    api<NetlifySiteResponse>("/sites", { method: "POST", body: { name: opts.siteName } })
  );
  log.success(`Created site: ${created.name} (${created.id})`);
  writeState(opts.cwd, created.id);
  return { siteId: created.id, siteName: created.name, netlifyHost: hostFromSite(created) };
}

function writeState(cwd: string, siteId: string): void {
  const dir = path.join(cwd, ".netlify");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ siteId }, null, 2) + "\n");
}

/* ------------------------------------------------------------------ *
 * Publish dir detection
 * ------------------------------------------------------------------ */

export function detectPublishDir(cwd: string, override?: string): string {
  if (override) return override;
  for (const candidate of ["dist", "build", "out", "public", "_site"]) {
    const p = path.join(cwd, candidate);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return candidate;
  }
  return ".";
}

/* ------------------------------------------------------------------ *
 * Deploy
 * ------------------------------------------------------------------ */

/**
 * Deploy to production via the Netlify CLI (uses NETLIFY_AUTH_TOKEN).
 * - `netlifyBuild: true` runs Netlify's framework-aware build pipeline
 *   (`--build`), required for Next.js/Nuxt/etc. — Netlify detects the framework
 *   and the publish dir itself.
 * - otherwise it uploads a pre-built static directory (`--dir`).
 */
export async function deploy(opts: {
  cwd: string;
  siteId: string;
  publishDir?: string;
  netlifyBuild?: boolean;
}): Promise<string> {
  const args = ["deploy", "--prod", "--site", opts.siteId, "--json"];
  if (opts.netlifyBuild) {
    args.push("--build");
    log.step("Netlify: running framework-aware build and deploying to production");
  } else {
    args.push("--dir", opts.publishDir ?? ".");
    log.step(`Netlify: deploying "${opts.publishDir ?? "."}" to production`);
  }
  const res = await retry("Netlify deploy", () => run("netlify", args, { cwd: opts.cwd }), {
    tries: 2,
    delayMs: 5000,
  });
  // CLI prints a JSON object; isolate it from any surrounding log lines.
  let deployUrl = "";
  try {
    const start = res.stdout.indexOf("{");
    const json = JSON.parse(res.stdout.slice(start));
    deployUrl = json.deploy_url || json.url || json.ssl_url || "";
  } catch {
    /* non-fatal: deploy may have succeeded even if JSON parse fails */
  }
  log.success(`Deployed${deployUrl ? `: ${deployUrl}` : ""}`);
  return deployUrl;
}

/* ------------------------------------------------------------------ *
 * Git-linked continuous deployment (deploy key + webhook)
 * ------------------------------------------------------------------ */

/** Has this site already been linked to a Git repo? */
export async function isGitLinked(siteId: string): Promise<boolean> {
  const s = await api<NetlifySiteResponse & { build_settings?: { repo_url?: string } }>(`/sites/${siteId}`);
  return Boolean(s.build_settings?.repo_url);
}

/** Create a Netlify deploy key. The public half goes on the GitHub repo. */
export async function createDeployKey(): Promise<{ id: string; publicKey: string }> {
  log.step("Netlify: creating deploy key");
  const res = await retry("Netlify deploy key", () =>
    api<{ id: string; public_key: string }>("/deploy_keys", { method: "POST" })
  );
  log.success("Deploy key created");
  return { id: res.id, publicKey: res.public_key };
}

/**
 * Link a GitHub repo to the site so pushes build automatically. The `repo`
 * object shape follows Netlify's "linking a repository via API" support guide.
 */
export async function linkRepoToSite(opts: {
  siteId: string;
  nameWithOwner: string;
  repoId: number;
  branch: string;
  cmd: string;
  dir: string;
  deployKeyId: string;
  private: boolean;
}): Promise<void> {
  log.step(`Netlify: linking ${opts.nameWithOwner}@${opts.branch} for continuous deployment`);
  const repo: Record<string, unknown> = {
    provider: "github",
    repo: opts.nameWithOwner,
    repo_id: opts.repoId,
    branch: opts.branch,
    private: opts.private,
    deploy_key_id: opts.deployKeyId,
    allowed_branches: [opts.branch],
  };
  // Leave cmd/dir unset when unknown so Netlify's framework detection fills them.
  if (opts.cmd) repo.cmd = opts.cmd;
  if (opts.dir) repo.dir = opts.dir;
  await retry("Netlify link repo", () =>
    api(`/sites/${opts.siteId}`, { method: "PATCH", body: { repo } })
  );
  log.success("Repo linked");
}

interface NetlifyDeploy {
  id: string;
  state: string; // "new" | "building" | "uploading" | "ready" | "error" | ...
  error_message?: string;
  deploy_ssl_url?: string;
  ssl_url?: string;
  created_at?: string;
}

/** Kick off a fresh production build (used for the very first git-linked deploy). */
export async function triggerBuild(siteId: string, branch: string): Promise<void> {
  log.step("Netlify: triggering initial build");
  try {
    await retry("Netlify build", () =>
      api(`/sites/${siteId}/builds`, { method: "POST", body: { clear_cache: false, branch } })
    );
    log.success("Build triggered");
  } catch (e) {
    // Non-fatal: the push webhook may already have started a build.
    log.warn(`Could not trigger a build explicitly (${(e as Error).message.split("\n")[0]}); relying on the push webhook`);
  }
}

/** Poll the site's latest deploy until it is live or fails. */
export async function waitForDeploy(siteId: string, timeoutMs = 420_000): Promise<NetlifyDeploy | null> {
  log.step("Netlify: waiting for the build to finish");
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const deploys = await api<NetlifyDeploy[]>(`/sites/${siteId}/deploys?per_page=1`).catch(() => []);
    const d = deploys?.[0];
    if (d) {
      if (d.state !== last) {
        log.info(`deploy ${d.id}: ${d.state}`);
        last = d.state;
      }
      if (d.state === "ready") {
        log.success("Build finished and published");
        return d;
      }
      if (d.state === "error") {
        throw new DeployError(
          `Netlify build failed: ${d.error_message ?? "unknown error"}`,
          `Check the build log: https://app.netlify.com/sites/<site>/deploys/${d.id}`
        );
      }
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  log.warn("Timed out waiting for the build; it may still be running on Netlify");
  return null;
}

/* ------------------------------------------------------------------ *
 * Custom domain + SSL
 * ------------------------------------------------------------------ */

/** Attach a custom domain to the site (idempotent). */
export async function attachCustomDomain(opts: { siteId: string; fqdn: string }): Promise<void> {
  log.step(`Netlify: attaching custom domain ${opts.fqdn}`);
  const site = await api<NetlifySiteResponse>(`/sites/${opts.siteId}`);
  if (site.custom_domain === opts.fqdn) {
    log.success("Custom domain already set");
    return;
  }
  await retry("Netlify set custom domain", () =>
    api(`/sites/${opts.siteId}`, { method: "PATCH", body: { custom_domain: opts.fqdn } })
  );
  log.success(`Custom domain set to ${opts.fqdn}`);
}

/** Ask Netlify to (re)provision the Let's Encrypt certificate. Best-effort. */
export async function provisionSSL(siteId: string): Promise<void> {
  log.step("Netlify: requesting SSL certificate provisioning");
  try {
    await retry("Netlify SSL provision", () => api(`/sites/${siteId}/ssl`, { method: "POST" }), {
      tries: 4,
      delayMs: 8000,
    });
    log.success("SSL provisioning requested");
  } catch (e) {
    log.warn(`SSL provisioning request did not succeed yet (${(e as Error).message.split("\n")[0]}); will rely on live-URL polling`);
  }
}
