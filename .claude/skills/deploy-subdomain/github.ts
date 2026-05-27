import path from "node:path";
import { run, log, retry, DeployError } from "./utils";

export interface GitHubResult {
  repoName: string;
  remoteUrl: string;
  branch: string;
  /** "owner/name" — needed for the Netlify repo link and the gh API. */
  nameWithOwner: string;
  /** GitHub's numeric repo id — required in Netlify's repo object. */
  repoId: number;
}

async function git(args: string[], cwd: string, allowFail = false) {
  return run("git", args, { cwd, allowFail, quiet: true });
}

function repoNameFromUrl(url: string): string {
  // git@github.com:owner/name.git  OR  https://github.com/owner/name.git
  const cleaned = url.replace(/\.git$/, "");
  const seg = cleaned.split(/[/:]/).pop() ?? "repo";
  return seg;
}

/**
 * Ensure the current directory is a git repo with a committed snapshot, has a
 * GitHub `origin` remote, and that HEAD is pushed. Idempotent: reuses an
 * existing remote/repo; only creates what is missing.
 */
export async function ensureGitHubRepo(opts: {
  cwd: string;
  repoName?: string;
  private: boolean;
}): Promise<GitHubResult> {
  const { cwd } = opts;
  log.step("GitHub: ensuring repository and pushing code");

  // 1. git repo?
  const insideGit = !(await git(["rev-parse", "--is-inside-work-tree"], cwd, true)).failed;
  if (!insideGit) {
    log.info("No git repository found — initialising one (branch: main)");
    await git(["init"], cwd);
    await git(["branch", "-M", "main"], cwd, true);
  }

  // 2. ensure there is at least one commit and all work is staged/committed
  const hadCommit = !(await git(["rev-parse", "HEAD"], cwd, true)).failed;
  await git(["add", "-A"], cwd);
  const status = await git(["status", "--porcelain"], cwd);
  if (!hadCommit || status.stdout.trim()) {
    const msg = hadCommit ? "Deploy via deploy-subdomain skill" : "Initial commit";
    const res = await git(["commit", "-m", msg], cwd, true);
    if (!res.failed) log.success(`Committed working tree (${msg})`);
  } else {
    log.info("Working tree clean — nothing new to commit");
  }

  // Fail clearly if there is still nothing to deploy (e.g. an empty directory).
  if ((await git(["rev-parse", "HEAD"], cwd, true)).failed) {
    throw new DeployError(
      "No commits to deploy — the project directory has no files to commit.",
      "Add your project files, then re-run the deploy."
    );
  }

  const branchRes = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd, true);
  const branch = (branchRes.failed ? "" : branchRes.stdout.trim()) || "main";

  // 3. origin remote?
  const originRes = await git(["remote", "get-url", "origin"], cwd, true);
  const hasOrigin = !originRes.failed;

  let remoteUrl: string;
  let repoName: string;

  if (hasOrigin) {
    remoteUrl = originRes.stdout.trim();
    repoName = repoNameFromUrl(remoteUrl);
    log.success(`Reusing existing remote origin: ${remoteUrl}`);
    await retry("git push", () => git(["push", "-u", "origin", branch], cwd) as Promise<unknown>, {
      tries: 3,
    });
  } else {
    repoName = opts.repoName ?? path.basename(path.resolve(cwd));
    const visibility = opts.private ? "--private" : "--public";
    log.info(`Creating GitHub repo "${repoName}" (${opts.private ? "private" : "public"})`);

    // gh reads GH_TOKEN / GITHUB_TOKEN for auth automatically.
    const create = await run(
      "gh",
      ["repo", "create", repoName, "--source", ".", "--remote", "origin", "--push", visibility],
      { cwd, allowFail: true }
    );

    if (create.failed) {
      // Most common rerun case: repo already exists on GitHub. Recover by
      // wiring up the remote and pushing, instead of failing.
      log.warn("`gh repo create` failed — checking whether the repo already exists");
      const view = await run("gh", ["repo", "view", repoName, "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
        cwd,
        allowFail: true,
        quiet: true,
      });
      if (view.failed) {
        throw new DeployError(
          `Could not create or find GitHub repo "${repoName}".\n${String(create.all ?? "").slice(-800)}`,
          "Check that GITHUB_TOKEN is valid and has repo scope, or pass a different name with --repo."
        );
      }
      const nameWithOwner = view.stdout.trim();
      log.success(`Repo already exists: ${nameWithOwner} — attaching remote`);
      await git(["remote", "add", "origin", `https://github.com/${nameWithOwner}.git`], cwd, true);
      await retry("git push", () => git(["push", "-u", "origin", branch], cwd) as Promise<unknown>, { tries: 3 });
    }

    remoteUrl = (await git(["remote", "get-url", "origin"], cwd)).stdout.trim();
    log.success(`Pushed to ${remoteUrl}`);
  }

  // Resolve the canonical owner/name + numeric id (needed by the Netlify link).
  const nwoRes = await run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    cwd,
    allowFail: true,
    quiet: true,
  });
  const nameWithOwner = nwoRes.failed ? "" : nwoRes.stdout.trim();
  let repoId = 0;
  if (nameWithOwner) {
    const idRes = await run("gh", ["api", `repos/${nameWithOwner}`, "--jq", ".id"], {
      cwd,
      allowFail: true,
      quiet: true,
    });
    if (!idRes.failed) repoId = parseInt(idRes.stdout.trim(), 10) || 0;
  }

  return { repoName, remoteUrl, branch, nameWithOwner, repoId };
}

const NETLIFY_HOOK_URL = "https://api.netlify.com/hooks/github";

/**
 * Add Netlify's deploy key to the repo (read-only). The key title is
 * site-specific so multiple Netlify sites can link the same repo without
 * clobbering each other's keys. Idempotent: an existing key with the same
 * title is removed first so the public key always matches the current key.
 */
export async function addDeployKey(opts: {
  cwd: string;
  nameWithOwner: string;
  publicKey: string;
  title: string;
}): Promise<void> {
  log.step("GitHub: adding Netlify deploy key to the repo");
  const list = await run("gh", ["api", `repos/${opts.nameWithOwner}/keys`], {
    cwd: opts.cwd,
    allowFail: true,
    quiet: true,
  });
  if (!list.failed) {
    try {
      const keys = JSON.parse(list.stdout) as { id: number; title: string }[];
      for (const k of keys.filter((k) => k.title === opts.title)) {
        await run("gh", ["api", "-X", "DELETE", `repos/${opts.nameWithOwner}/keys/${k.id}`], {
          cwd: opts.cwd,
          allowFail: true,
          quiet: true,
        });
      }
    } catch {
      /* non-fatal: fall through and try to add */
    }
  }
  const add = await run(
    "gh",
    [
      "api",
      `repos/${opts.nameWithOwner}/keys`,
      "-f",
      `title=${opts.title}`,
      "-f",
      `key=${opts.publicKey}`,
      "-F",
      "read_only=true",
    ],
    { cwd: opts.cwd, allowFail: true, quiet: true }
  );
  if (add.failed) {
    throw new DeployError(
      `Failed to add the Netlify deploy key to ${opts.nameWithOwner}.\n${String(add.all ?? "").slice(-600)}`,
      "Ensure GITHUB_TOKEN has admin/repo scope on this repository."
    );
  }
  log.success("Deploy key installed on GitHub");
}

/**
 * Ensure a GitHub webhook posts push/PR events to Netlify so commits trigger
 * builds. Idempotent: skips if a hook already points at Netlify.
 */
export async function ensureWebhook(opts: { cwd: string; nameWithOwner: string }): Promise<void> {
  log.step("GitHub: ensuring build webhook → Netlify");
  const list = await run("gh", ["api", `repos/${opts.nameWithOwner}/hooks`], {
    cwd: opts.cwd,
    allowFail: true,
    quiet: true,
  });
  if (!list.failed) {
    try {
      const hooks = JSON.parse(list.stdout) as { config?: { url?: string } }[];
      if (hooks.some((h) => h.config?.url === NETLIFY_HOOK_URL)) {
        log.success("Webhook already present");
        return;
      }
    } catch {
      /* fall through and create */
    }
  }
  const create = await run(
    "gh",
    [
      "api",
      `repos/${opts.nameWithOwner}/hooks`,
      "-f",
      "name=web",
      "-f",
      `config[url]=${NETLIFY_HOOK_URL}`,
      "-f",
      "config[content_type]=json",
      "-f",
      "events[]=push",
      "-f",
      "events[]=pull_request",
      "-F",
      "active=true",
    ],
    { cwd: opts.cwd, allowFail: true, quiet: true }
  );
  if (create.failed) {
    throw new DeployError(
      `Failed to create the Netlify webhook on ${opts.nameWithOwner}.\n${String(create.all ?? "").slice(-600)}`,
      "Ensure GITHUB_TOKEN has admin scope on this repository."
    );
  }
  log.success("Webhook created");
}
