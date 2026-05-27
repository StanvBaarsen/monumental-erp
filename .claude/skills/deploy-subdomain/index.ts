#!/usr/bin/env -S npx tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  log,
  run,
  sleep,
  pollUntil,
  requireEnv,
  loadDotEnv,
  commandExists,
  DeployError,
} from "./utils";
import { ensureGitHubRepo, addDeployKey, ensureWebhook } from "./github";
import {
  ensureSite,
  deploy,
  attachCustomDomain,
  provisionSSL,
  detectPublishDir,
  isGitLinked,
  createDeployKey,
  linkRepoToSite,
  triggerBuild,
  waitForDeploy,
} from "./netlify";
import { ensureCname } from "./cloudflare";

const BASE_DOMAIN = "monumental.stanvanbaarsen.nl";
// GITHUB_TOKEN is optional: if absent we fall back to the gh CLI's own auth.
const REQUIRED_ENV = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID", "NETLIFY_AUTH_TOKEN"];
const REQUIRED_CLIS = ["git", "gh", "netlify"];

interface Args {
  subdomain: string;
  repoName?: string;
  publishDir?: string;
  build: boolean;
  public: boolean;
  proxied: boolean;
  cliDeploy: boolean;
}

function parseArgs(argv: string[]): Args {
  // Default to DNS-only (no Cloudflare proxy): Netlify issues the TLS cert for
  // the exact hostname, which is the reliable path for deep subdomains.
  const out: Args = { subdomain: "", build: false, public: false, proxied: false, cliDeploy: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--repo": out.repoName = argv[++i]; break;
      case "--dir": out.publishDir = argv[++i]; break;
      case "--build": out.build = true; break;
      case "--public": out.public = true; break;
      case "--proxy": out.proxied = true; break;
      case "--no-proxy": out.proxied = false; break;
      case "--cli-deploy": out.cliDeploy = true; break;
      default:
        if (a.startsWith("--")) throw new DeployError(`Unknown flag: ${a}`);
        if (!out.subdomain) out.subdomain = a;
    }
  }
  return out;
}

/**
 * For Git-triggered builds, Netlify detects Next.js but does NOT auto-run
 * @netlify/plugin-nextjs on a freshly-created site — it publishes raw `.next`
 * files and 404s on every route. Writing a netlify.toml that declares the
 * plugin makes Git builds wire up the server handler + routing. Written before
 * the repo is pushed so it lands in the first commit. No-op if a toml exists or
 * the project isn't Next.js.
 */
function ensureNetlifyToml(projectDir: string): void {
  const tomlPath = path.join(projectDir, "netlify.toml");
  if (fs.existsSync(tomlPath)) return;
  let pkg: any = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  } catch {
    return;
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps?.next) return; // only Next.js needs the runtime plugin declared today
  fs.writeFileSync(
    tomlPath,
    [
      "[build]",
      '  command = "npm run build"',
      '  publish = ".next"',
      "",
      "# Next.js runtime: required so Git-triggered builds wire up routing.",
      "[[plugins]]",
      '  package = "@netlify/plugin-nextjs"',
      "",
      "[build.environment]",
      '  NODE_VERSION = "22"',
      "",
    ].join("\n")
  );
  log.success("Wrote netlify.toml (Next.js runtime plugin) for reliable Git builds");
}

/**
 * Decide the build command + publish dir for the git-linked Netlify build.
 * Netlify auto-detects most frameworks during a Git build; we only set hints
 * where they help (Next.js publishes `.next`). `--dir` always wins.
 */
function resolveBuildConfig(projectDir: string, args: Args): { cmd: string; dir: string } {
  let pkg: any = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  } catch {
    /* no package.json — pure static site */
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasBuild = Boolean(pkg.scripts?.build);

  if (args.publishDir) {
    return { cmd: hasBuild && args.build ? "npm run build" : "", dir: args.publishDir };
  }
  if (deps?.next) return { cmd: "npm run build", dir: ".next" };
  if (hasBuild) return { cmd: "npm run build", dir: "dist" }; // common bundler default; override with --dir
  return { cmd: "", dir: detectPublishDir(projectDir) };
}

function normalizeSubdomain(raw: string): string {
  // Accept a bare label or a full hostname; keep only the leftmost label.
  let label = raw.trim().toLowerCase();
  if (label.includes(".")) label = label.split(".")[0];
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
    throw new DeployError(
      `Invalid subdomain label: "${raw}"`,
      "Use only lowercase letters, digits and hyphens (e.g. birds, my-app)."
    );
  }
  return label;
}

/** GitHub site names must be globally unique; suffix the label to reduce collisions. */
function siteNameFor(subdomain: string): string {
  return `monumental-${subdomain}`;
}

async function main() {
  const skillDir = path.dirname(fileURLToPath(import.meta.url));
  const projectDir = process.cwd();

  // Load secrets from skill-local .env (does not override existing env).
  loadDotEnv(path.join(skillDir, ".env"));
  loadDotEnv(path.join(projectDir, ".env"));

  const args = parseArgs(process.argv.slice(2));
  if (!args.subdomain) {
    throw new DeployError(
      "No subdomain provided.",
      "Usage: npx tsx index.ts <subdomain> [--repo name] [--dir path] [--build] [--public] [--no-proxy]"
    );
  }
  const subdomain = normalizeSubdomain(args.subdomain);
  const fqdn = `${subdomain}.${BASE_DOMAIN}`;

  log.step(`Deploying ${projectDir} → https://${fqdn}`);

  // Pre-flight: secrets and CLIs.
  requireEnv(REQUIRED_ENV);
  for (const cli of REQUIRED_CLIS) {
    if (!(await commandExists(cli))) {
      throw new DeployError(
        `Required CLI "${cli}" is not installed or not on PATH.`,
        cli === "gh"
          ? "Install with: brew install gh"
          : cli === "netlify"
          ? "Install with: npm i -g netlify-cli"
          : "Install git via your package manager."
      );
    }
  }

  // GitHub auth: prefer GITHUB_TOKEN if provided, else rely on the gh CLI's
  // own login (keyring / OAuth). Fail fast if neither is available.
  if (process.env.GITHUB_TOKEN?.trim()) {
    process.env.GH_TOKEN = process.env.GITHUB_TOKEN;
  } else {
    const auth = await run("gh", ["auth", "status"], { allowFail: true, quiet: true });
    if (auth.failed) {
      throw new DeployError(
        "GitHub is not authenticated.",
        "Run `gh auth login`, or set GITHUB_TOKEN in the skill's .env."
      );
    }
    log.info("Using existing gh CLI authentication");
  }

  // Deep-subdomain SSL guidance.
  if (args.proxied && BASE_DOMAIN.split(".").length > 2) {
    log.warn(
      "Proxying a deep subdomain. Cloudflare Universal SSL may not cover " +
        `*.${BASE_DOMAIN}. If HTTPS does not come up, re-run with --no-proxy ` +
        "so Netlify issues the certificate directly."
    );
  }

  // 0. Ensure framework build config is committed before the first push.
  if (!args.cliDeploy) ensureNetlifyToml(projectDir);

  // 1. GitHub
  const gh = await ensureGitHubRepo({ cwd: projectDir, repoName: args.repoName, private: !args.public });

  // 2. Netlify site
  const site = await ensureSite({ cwd: projectDir, siteName: siteNameFor(subdomain) });

  // 3. Deploy.
  if (args.cliDeploy) {
    // Escape hatch: one-shot manual deploy via the CLI (no git-triggered builds).
    const hasBuildScript = (() => {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
        return Boolean(pkg.scripts?.build);
      } catch {
        return false;
      }
    })();
    const useNetlifyBuild = !args.publishDir && (args.build || hasBuildScript);
    if (useNetlifyBuild) {
      log.info("Detected a build script — using Netlify's framework-aware build");
      await deploy({ cwd: projectDir, siteId: site.siteId, netlifyBuild: true });
    } else {
      const publishDir = detectPublishDir(projectDir, args.publishDir);
      log.info(`Publish directory: ${publishDir}`);
      await deploy({ cwd: projectDir, siteId: site.siteId, publishDir });
    }
  } else {
    // Default: connect the GitHub repo so every push builds on Netlify.
    if (await isGitLinked(site.siteId)) {
      log.success("Site already linked to Git — the push above will trigger a build");
    } else {
      if (!gh.nameWithOwner || !gh.repoId) {
        throw new DeployError(
          "Could not resolve the GitHub repo identity needed to link it to Netlify.",
          "Ensure `gh` is authenticated and the repo exists, or use --cli-deploy."
        );
      }
      const { cmd, dir } = resolveBuildConfig(projectDir, args);
      const key = await createDeployKey();
      await addDeployKey({
        cwd: projectDir,
        nameWithOwner: gh.nameWithOwner,
        publicKey: key.publicKey,
        title: `Netlify: ${site.siteName}`,
      });
      await ensureWebhook({ cwd: projectDir, nameWithOwner: gh.nameWithOwner });
      await linkRepoToSite({
        siteId: site.siteId,
        nameWithOwner: gh.nameWithOwner,
        repoId: gh.repoId,
        branch: gh.branch,
        cmd,
        dir,
        deployKeyId: key.id,
        private: !args.public,
      });
      // The push happened before the webhook existed, so kick the first build.
      await triggerBuild(site.siteId, gh.branch);
    }
    await waitForDeploy(site.siteId);
  }

  // 4. Custom domain on Netlify
  await attachCustomDomain({ siteId: site.siteId, fqdn });

  // 5. Cloudflare DNS → Netlify host
  await ensureCname({ fqdn, target: site.netlifyHost, proxied: args.proxied });

  // 6. SSL provisioning + propagation wait
  await provisionSSL(site.siteId);
  log.step(`Waiting for https://${fqdn} to come live (SSL + DNS propagation)`);
  const live = await pollUntil(
    "Live check",
    async () => {
      const res = await fetch(`https://${fqdn}`, { redirect: "manual" }).catch(() => null);
      if (!res) return false;
      // Any non-5xx response from the right host means the edge + cert are serving.
      return res.status < 500;
    },
    { timeoutMs: 360_000, intervalMs: 12_000 }
  );

  // 7. Report
  const url = `https://${fqdn}`;
  console.log("");
  log.success("Deploy complete");
  console.log("");
  console.log(`  Live URL:      ${url}`);
  console.log(`  Netlify site:  ${site.siteName} (https://${site.netlifyHost})`);
  console.log(`  GitHub repo:   ${gh.remoteUrl}`);
  console.log(`  Deploy mode:   ${args.cliDeploy ? "manual CLI deploy" : `continuous — push to ${gh.branch} to deploy`}`);
  console.log("");
  if (!live) {
    log.warn(
      "Timed out waiting for HTTPS. DNS/SSL can take a few more minutes — the " +
        "URL above will work once propagation finishes. For deep subdomains, " +
        "re-running with --no-proxy is the most reliable fix."
    );
  }
}

main().catch((err) => {
  if (err instanceof DeployError) {
    log.error(err.message);
    if (err.hint) log.info(`Hint: ${err.hint}`);
  } else {
    log.error(`Unexpected error: ${(err as Error).stack ?? err}`);
  }
  process.exit(1);
});
