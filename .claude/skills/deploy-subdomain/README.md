# deploy-subdomain

A Claude Code skill that deploys the **current project** to a dynamic subdomain
under `*.monumental.stanvanbaarsen.nl`.

```
deploy this project to birds.monumental.stanvanbaarsen.nl
```

…runs an idempotent pipeline: **GitHub → Netlify → Cloudflare DNS → wait for SSL → print URL**.

## What it does

| Step | Tool | Behaviour |
|------|------|-----------|
| 1. Repo | `git` + `gh` | Inits git if missing, commits, creates the repo (folder name unless `--repo`), pushes. Reuses an existing `origin`. |
| 2. Site | `netlify` API | Reuses `.netlify/state.json`, else finds a site by name, else creates one. |
| 3. Deploy | `netlify` CLI | `netlify deploy --prod` of the publish dir (auto-detected or `--dir`). |
| 4. Domain | `netlify` API | Sets `custom_domain` to the FQDN. |
| 5. DNS | Cloudflare API | Creates/updates the `CNAME` → `<site>.netlify.app` (proxied by default). |
| 6. SSL | Netlify API + polling | Requests a cert, then polls `https://<fqdn>` until it serves. |
| 7. Report | — | Prints the live URL, Netlify host, and GitHub remote. |

Every step is safe to re-run.

## Prerequisites

- **Node ≥ 18** (for global `fetch`).
- CLIs on `PATH`: `git`, [`gh`](https://cli.github.com), [`netlify`](https://docs.netlify.com/cli/get-started/).
- Four secrets (see `.env.example`).

### Install commands

```bash
# CLIs (macOS)
brew install gh
npm install -g netlify-cli

# Skill dependencies (run once, inside this skill directory)
cd .claude/skills/deploy-subdomain
npm install
```

## Configure secrets

```bash
cp .env.example .env   # then fill in the four values
```

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_API_TOKEN` | Zone:DNS:Edit token for `stanvanbaarsen.nl`. |
| `CLOUDFLARE_ZONE_ID` | Zone ID of the parent zone. |
| `NETLIFY_AUTH_TOKEN` | Netlify PAT (used by CLI + API). |
| `GITHUB_TOKEN` | *Optional.* Only needed if `gh` isn't already logged in (`gh auth login`). PAT with `repo` scope. |

The script loads `.env` from the skill dir and the project dir, and never
overrides variables already exported in your shell.

## Usage

From the **project you want to deploy**:

```bash
npx --yes tsx /abs/path/.claude/skills/deploy-subdomain/index.ts birds
```

Or via npm from the skill dir (deploys *that* dir — usually pass a path instead):

```bash
npm run deploy -- birds
```

### Flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--repo <name>` | folder name | GitHub repo name. |
| `--dir <path>` | auto / `.` | Netlify publish directory. |
| `--build` | off | Run `npm run build` before deploying. |
| `--public` | private | Create the GitHub repo public. |
| `--proxy` | DNS-only | Turn ON Cloudflare proxying (orange cloud). |

## SSL on deep subdomains (important)

`birds.monumental.stanvanbaarsen.nl` is a **third-level** name. Cloudflare's free
Universal SSL covers `stanvanbaarsen.nl` and `*.stanvanbaarsen.nl` only — **not**
`*.monumental.stanvanbaarsen.nl`. Hence:

- **Default (DNS-only)** → the record points straight at Netlify, which issues a
  Let's Encrypt cert for the exact hostname. Simplest and most reliable.
- **`--proxy`** → only if the zone has **Total TLS / an Advanced Certificate**
  covering this depth; otherwise the cert will not validate.

The script warns if you enable `--proxy` on a deep subdomain, and still prints
the URL if SSL is mid-propagation.

## Type-check

```bash
npm run typecheck
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Missing required environment variable(s)` | Fill in `.env`. |
| `Required CLI "gh"/"netlify" is not installed` | See install commands above. |
| `gh repo create failed` then recovers | Repo already existed; the script reattaches the remote and pushes. |
| HTTPS times out | Wait a few minutes, or re-run with `--no-proxy`. |
| Netlify site name taken by another account | Pass a different subdomain, or delete the conflicting site. |
