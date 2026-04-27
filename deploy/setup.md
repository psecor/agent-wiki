---
title: agent-wiki deployment
---

# Deploying agent-wiki to secorp.net/wiki

agent-wiki runs as a single Express service on `127.0.0.1:3045`, fronted by
Apache at `https://secorp.net/wiki`. It hosts both the JSON API (under
`/wiki/api/*`) and the React UI (built static assets) from the same Node
process. Sessions are file-backed (no DB).

This guide covers the one-time install. Day-to-day updates are just `git
pull && (cd service && npm install && npm run build) && (cd ui && npm
install && npm run build) && sudo systemctl restart agent-wiki`.

## Prerequisites
- Node 20+ on the box.
- Apache with `proxy`, `proxy_http`, `headers` modules enabled.
- Letsencrypt cert already covering `secorp.net` (it does — same vhost as
  rssreader/meetingapp/termag).

## 1. Build indexer + server + UI

```sh
cd ~/termag/projects/agent-wiki/service
npm install
npm run build          # tsc → dist/

cd ~/termag/projects/agent-wiki/ui
npm install
npm run build          # vite → dist/  (base: /wiki/)
```

Run the indexer once so the JSON files exist:

```sh
cd ~/termag/projects/agent-wiki/service
npm run indexer:built -- build
```

## 2. Google OAuth client

Create an OAuth 2.0 Client ID in the Google Cloud console (any project you
own — the one used for rssreader/donno is fine). Type: **Web application**.

- Authorized redirect URI: `https://secorp.net/wiki/auth/google/callback`
- Authorized JavaScript origin: `https://secorp.net`

Note the client ID and secret — they go in `.env` next.

## 3. Service `.env`

Copy `service/.env.example` to `service/.env` and fill in:

```env
PORT=3045
BASE_URL=https://secorp.net
PATH_PREFIX=/wiki
SESSION_SECRET=<long random hex>
GOOGLE_CLIENT_ID=<from step 2>
GOOGLE_CLIENT_SECRET=<from step 2>
ALLOWED_EMAILS=secorp@gmail.com
INDEX_DIR=/home/secorp/termag/projects/agent-wiki/index
PROJECTS_ROOT=/home/secorp/termag/projects
UI_DIST=/home/secorp/termag/projects/agent-wiki/ui/dist
```

A reasonable session secret:
```sh
openssl rand -hex 32
```

`.env` is gitignored — never commit it.

## 4. systemd unit

```sh
sudo cp ~/termag/projects/agent-wiki/deploy/agent-wiki.service \
        /etc/systemd/system/agent-wiki.service
sudo systemctl daemon-reload
sudo systemctl enable --now agent-wiki
sudo systemctl status agent-wiki
journalctl -u agent-wiki -f
```

You should see `[agent-wiki] listening on 127.0.0.1:3045, mounted at /wiki`.

## 5. Apache

Add the contents of `deploy/apache.conf` to the existing HTTPS
VirtualHost in `/etc/apache2/sites-available/secorp.conf`, alongside the
other prefix-based apps. Then:

```sh
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Browse to `https://secorp.net/wiki/` and sign in with an allowlisted
Google account.

## 6. Keeping the index fresh

For v1, re-run the indexer manually after AGENTS.md edits:

```sh
cd ~/termag/projects/agent-wiki/service
npm run indexer:built -- build
```

A periodic sweeper (cron / systemd timer) is on the roadmap; until
then, this is a one-liner. The server reads JSON on every request, so
a fresh `build` is picked up immediately — no restart needed.

## Troubleshooting
- **"GOOGLE_CLIENT_ID is required in environment"** — `.env` not present
  or systemd `EnvironmentFile=` path wrong. Check `journalctl -u agent-wiki`.
- **OAuth redirects back with `?error=denied`** — your email isn't in
  `ALLOWED_EMAILS`. Add it (comma-separated), restart the service.
- **Apache 503** — service isn't running. `sudo systemctl status agent-wiki`.
- **`agent-wiki UI not built`** message in browser — you skipped step 1's
  `cd ui && npm run build`. The server checks for `ui/dist/index.html`.
