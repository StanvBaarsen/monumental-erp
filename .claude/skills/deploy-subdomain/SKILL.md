---
name: deploy-subdomain
description: >-
  Deploy the current project to a dynamic subdomain under
  *.monumental.stanvanbaarsen.nl. Use whenever the user asks to "deploy this to
  <name>.monumental.stanvanbaarsen.nl", "deploy-monumental-subdomain <name>", or
  to publish/ship a project to a monumental subdomain. The skill creates a
  GitHub repo, deploys to Netlify, wires up Cloudflare DNS, waits for SSL, and
  returns the live HTTPS URL.
---

# deploy-subdomain

End-to-end, idempotent deploy of the **current working directory** to
`<subdomain>.monumental.stanvanbaarsen.nl`.

It orchestrates four CLIs/APIs in order:

1. **GitHub** (`gh` + `git`) — init git, create repo, commit, push.
2. **Netlify** (`netlify` CLI + REST API) — create/reuse site, **link the GitHub
   repo for continuous deployment** (deploy key + webhook), attach custom domain.
3. **Cloudflare** (REST API) — create/update the `CNAME` for the subdomain.
4. **Wait** — poll until the build finishes and HTTPS is live, then print the URL.

Every step is safe to re-run. State is reused from `.netlify/state.json`, the
existing `git remote origin`, and existing Cloudflare DNS records.

## Deploy mode: continuous by default

By default the site is **linked to the GitHub repo** so every push to the
deploy branch builds on Netlify automatically — no manual redeploys. The link is
created entirely via API (no interactive OAuth):

1. `POST /api/v1/deploy_keys` on Netlify → returns a public key.
2. The public key is added to the repo as a **read-only deploy key** (`gh api`).
3. The site is `PATCH`ed with a `repo` object (`provider: github`, `repo`,
   `repo_id`, `branch`, `cmd`, `dir`, `deploy_key_id`).
4. A GitHub **webhook** → `https://api.netlify.com/hooks/github` triggers builds
   on push. The first build is kicked explicitly (the initial push predates the
   webhook); subsequent pushes build on their own.

Pass **`--cli-deploy`** to skip git-linking and do a one-shot manual deploy via
the Netlify CLI instead (the old behaviour — useful for throwaway/static drops).

> Note: the deploy-key method does not provide the GitHub App's PR deploy
> previews / commit status checks. It gives push-to-deploy on the main branch.

### Next.js note

Git-triggered builds detect Next.js but do **not** auto-run
`@netlify/plugin-nextjs` on a freshly-created site, so they publish raw `.next`
files and 404 on every route. The skill therefore writes a `netlify.toml`
(declaring the plugin + build command + `publish = ".next"` + Node 22) **before
the first push** for Next.js projects that don't already have one. Other static
frameworks are detected by Netlify directly.

## When to use

Trigger on requests like:

- "deploy this project to **birds**.monumental.stanvanbaarsen.nl"
- "deploy-monumental-subdomain **birds**"
- "ship this to the monumental subdomain **birds**"

Extract the **subdomain label** (e.g. `birds`) from the request. If the user
gives a full hostname, take only the leftmost label before
`.monumental.stanvanbaarsen.nl`.

## How to run it

The orchestrator lives in this skill directory. Run it from the **project the
user wants to deploy** (the current working directory), pointing at the script
in this skill folder.

1. **Confirm the subdomain.** If ambiguous, ask the user for the label.

2. **Check prerequisites.** These four env vars must be set (the script will
   fail fast with a clear message if any are missing):
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `GITHUB_TOKEN`,
   `NETLIFY_AUTH_TOKEN`. If a `.env` is present in the skill dir it is loaded
   automatically. If vars are missing, tell the user to fill in `.env` (see
   `.env.example`) and stop.

3. **Install deps once** (only if `node_modules` is missing in the skill dir):

   ```bash
   (cd "<SKILL_DIR>" && npm install)
   ```

4. **Run the deploy** from the project root:

   ```bash
   npx --yes tsx "<SKILL_DIR>/index.ts" <subdomain> [flags]
   ```

   `<SKILL_DIR>` is the absolute path to this skill folder
   (`.../.claude/skills/deploy-subdomain`). Always pass an absolute path so the
   script deploys the user's current directory, not the skill directory.

   Useful flags:
   - `--repo <name>` — override the GitHub repo name (defaults to folder name).
   - `--dir <path>` — publish directory (Next.js → `.next` auto; otherwise common
     build outputs like `dist`/`build`/`out`/`public` are auto-detected).
   - `--build` — only relevant with `--cli-deploy`; runs the build before upload.
   - `--cli-deploy` — skip git-linking; do a one-shot manual Netlify CLI deploy.
   - `--public` — create the GitHub repo as public (default is private).
   - `--proxy` — turn ON Cloudflare proxying (orange cloud). **Off by default**:
     the record is DNS-only so Netlify issues the TLS cert directly, which is
     the reliable path for deep subdomains. Only use `--proxy` if the zone has
     Total TLS / an Advanced Certificate covering `*.monumental.stanvanbaarsen.nl`.

5. **Stream the output** to the user and report the final
   `https://<subdomain>.monumental.stanvanbaarsen.nl` URL it prints. If SSL is
   still propagating when the timeout hits, the script prints the URL with a
   warning; relay that.

## Important SSL note for deep subdomains

`birds.monumental.stanvanbaarsen.nl` is a third-level name. Cloudflare's free
Universal SSL only covers the apex and one wildcard level (`*.stanvanbaarsen.nl`),
**not** `*.monumental.stanvanbaarsen.nl`. So:

- **Default (DNS-only)**: the record points straight at Netlify, which issues a
  Let's Encrypt cert for the exact hostname — the reliable path. No extra setup.
- **With `--proxy`**: HTTPS only works if the zone has Total TLS / an Advanced
  Certificate covering this depth; otherwise the cert will not validate.

The script warns automatically if you enable `--proxy` on a deep subdomain.

## Files in this skill

- `index.ts` — orchestrator / entrypoint.
- `github.ts` — git + `gh` repo creation and push.
- `netlify.ts` — site create/reuse, deploy, custom domain, SSL.
- `cloudflare.ts` — DNS record create/update via REST API.
- `utils.ts` — logging, retry, polling, subprocess, env validation.
- `.env.example` — required secrets.
- `README.md` — full setup instructions.
