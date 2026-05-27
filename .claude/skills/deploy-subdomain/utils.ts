import { execa } from "execa";
import fs from "node:fs";

/** Normalized result of a subprocess run. */
export interface RunResult {
  stdout: string;
  stderr: string;
  all: string;
  exitCode: number;
  failed: boolean;
}

/* ------------------------------------------------------------------ *
 * Logging
 * ------------------------------------------------------------------ */

const C = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function line(icon: string, color: string, msg: string): string {
  return `${C.gray}${stamp()}${C.reset} ${color}${icon}${C.reset} ${msg}`;
}

export const log = {
  info: (m: string) => console.log(line("·", C.blue, m)),
  step: (m: string) => console.log(line("▶", C.cyan, `${C.cyan}${m}${C.reset}`)),
  success: (m: string) => console.log(line("✔", C.green, m)),
  warn: (m: string) => console.warn(line("⚠", C.yellow, `${C.yellow}${m}${C.reset}`)),
  error: (m: string) => console.error(line("✖", C.red, `${C.red}${m}${C.reset}`)),
};

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/** A user-actionable failure. `hint` is printed as a suggested fix. */
export class DeployError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "DeployError";
    this.hint = hint;
  }
}

/* ------------------------------------------------------------------ *
 * Async helpers
 * ------------------------------------------------------------------ */

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run a command. By default a non-zero exit throws a DeployError carrying the
 * tail of combined stdout/stderr. With `allowFail`, the (failed) result is
 * returned instead so the caller can branch on `result.failed`.
 */
export async function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; allowFail?: boolean; quiet?: boolean; input?: string; env?: Record<string, string> } = {}
): Promise<RunResult> {
  const display = `${cmd} ${args.join(" ")}`;
  if (!opts.quiet) log.info(`${C.gray}$ ${display}${C.reset}`);
  const normalize = (r: any): RunResult => ({
    stdout: String(r.stdout ?? ""),
    stderr: String(r.stderr ?? ""),
    all: String(r.all ?? ""),
    exitCode: Number(r.exitCode ?? 0),
    failed: Boolean(r.failed),
  });
  try {
    const res = await execa(cmd, args, {
      cwd: opts.cwd,
      input: opts.input,
      all: true,
      env: opts.env ? { ...process.env, ...opts.env } : undefined,
    });
    return normalize(res);
  } catch (err) {
    if (opts.allowFail) return normalize(err);
    const tail = String((err as any).all ?? (err as Error).message ?? "").slice(-1800);
    throw new DeployError(`Command failed: ${display}\n${tail}`);
  }
}

/** True if the command is resolvable on PATH. */
export async function commandExists(cmd: string): Promise<boolean> {
  const res = await run("which", [cmd], { allowFail: true, quiet: true });
  return !res.failed;
}

/** Retry an async fn with exponential backoff. */
export async function retry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { tries?: number; delayMs?: number; factor?: number } = {}
): Promise<T> {
  const tries = opts.tries ?? 5;
  const factor = opts.factor ?? 2;
  let delay = opts.delayMs ?? 2000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === tries) break;
      const first = String((err as Error).message ?? err).split("\n")[0];
      log.warn(`${label} failed (attempt ${attempt}/${tries}): ${first}. Retrying in ${Math.round(delay / 1000)}s…`);
      await sleep(delay);
      delay *= factor;
    }
  }
  throw lastErr;
}

/**
 * Poll `check` until it returns true or the timeout elapses.
 * Returns whether it succeeded (does not throw on timeout).
 */
export async function pollUntil(
  label: string,
  check: () => Promise<boolean>,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<boolean> {
  const timeout = opts.timeoutMs ?? 300_000;
  const interval = opts.intervalMs ?? 10_000;
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeout) {
    attempt++;
    try {
      if (await check()) return true;
    } catch {
      /* treat errors as "not ready yet" */
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    log.info(`${label}: not ready yet (${elapsed}s elapsed, check #${attempt})…`);
    await sleep(interval);
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Environment
 * ------------------------------------------------------------------ */

/** Throws a DeployError listing any missing required env vars. */
export function requireEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new DeployError(
      `Missing required environment variable(s): ${missing.join(", ")}`,
      "Copy .env.example to .env in the skill directory and fill in the values, or export them in your shell."
    );
  }
}

/**
 * Minimal .env loader (no dependency). Loads KEY=VALUE lines into process.env
 * without overriding values already set. Ignores comments and blanks.
 */
export function loadDotEnv(filePath: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return; // no .env file is fine
  }
  for (const lineRaw of raw.split("\n")) {
    const ln = lineRaw.trim();
    if (!ln || ln.startsWith("#")) continue;
    const eq = ln.indexOf("=");
    if (eq === -1) continue;
    const key = ln.slice(0, eq).trim();
    let val = ln.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
