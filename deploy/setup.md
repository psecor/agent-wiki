---
title: agent-wiki deployment
---

# Deploying agent-wiki

agent-wiki runs as a single Express service on `127.0.0.1:3045`, fronted
by your reverse proxy (e.g. Apache) on a public HTTPS URL. It hosts both
the JSON API (under `<PATH_PREFIX>/api/*`) and the React UI (built static
assets) from the same Node process. Sessions are file-backed (no DB).

This guide covers the one-time install. Day-to-day updates are just `git
pull && (cd service && npm install && npm run build) && (cd ui && npm
install && npm run build) && sudo systemctl restart agent-wiki`.

## Prerequisites
- Node 20+ on the box.
- A reverse proxy (Apache + `proxy`, `proxy_http`, `headers` modules; or
  Nginx, Caddy, etc.).
- An HTTPS cert covering the domain you're serving from.

## 1. Build indexer + server + UI

From the agent-wiki repo root:

```sh
cd service
npm install
npm run build          # tsc → dist/

cd ../ui
npm install
npm run build          # vite → dist/  (base: ${PATH_PREFIX}/)
```

Run the indexer once so the JSON files exist:

```sh
cd ../service
npm run indexer:built -- build
```

## 2. Google OAuth client

Create an OAuth 2.0 Client ID in the Google Cloud console. Type: **Web
application**.

- Authorized redirect URI: `https://<your-domain>/<PATH_PREFIX>/auth/google/callback`
- Authorized JavaScript origin: `https://<your-domain>`

Note the client ID and secret — they go in `.env` next.

## 3. Service `.env`

Copy `service/.env.example` to `service/.env` and fill in:

```env
PORT=3045
BASE_URL=https://your-domain.example.com
PATH_PREFIX=/wiki
SESSION_SECRET=<long random hex>
GOOGLE_CLIENT_ID=<from step 2>
GOOGLE_CLIENT_SECRET=<from step 2>
ALLOWED_EMAILS=you@example.com
PROJECTS_ROOT=/path/to/your/projects
```

A reasonable session secret:
```sh
openssl rand -hex 32
```

`.env` is gitignored — never commit it.

## 4. systemd unit

Edit `deploy/agent-wiki.service` to set `User`, `Group`,
`WorkingDirectory`, `EnvironmentFile`, and `ReadWritePaths` to match
your install (the file ships with `/opt/agent-wiki/...` placeholders).
Then:

```sh
sudo cp deploy/agent-wiki.service /etc/systemd/system/agent-wiki.service
sudo systemctl daemon-reload
sudo systemctl enable --now agent-wiki
sudo systemctl status agent-wiki
journalctl -u agent-wiki -f
```

You should see `[agent-wiki] listening on 127.0.0.1:3045, mounted at <PATH_PREFIX>`.

## 5. Reverse proxy

For Apache, add the contents of `deploy/apache.conf` to the existing
HTTPS VirtualHost for your domain. Then:

```sh
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Browse to `https://<your-domain>/<PATH_PREFIX>/` and sign in with an
allowlisted Google account.

## 6. Keeping the index fresh

You can re-run the indexer manually after AGENTS.md edits:

```sh
cd service
npm run indexer:built -- build
```

The server reads JSON on every request, so a fresh `build` is picked
up immediately — no restart needed.

For unattended freshness, the daily sweeper timer (next section) runs
the indexer automatically after each sweep.

## 7. Daily sweeper timer

A user-mode systemd timer runs `sweeper --all` followed by `indexer
build` once a day at 03:00 local. Output goes to `journalctl --user`
**and** is tee'd to `~/.local/state/agent-wiki/last-run.log` for quick
review.

Edit `deploy/agent-wiki-sweeper.service` so its `ExecStart` points at
your checkout's `deploy/run-daily.sh`. Then:

```sh
# Install the unit files into the user systemd config.
mkdir -p ~/.config/systemd/user
cp deploy/agent-wiki-sweeper.service \
   deploy/agent-wiki-sweeper.timer \
   ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now agent-wiki-sweeper.timer

# So the timer fires even when you're not logged in:
sudo loginctl enable-linger "$USER"
```

The sweeper needs `ANTHROPIC_API_KEY` set in `service/.env` — that's
how it pays for the Claude calls that update each `AGENTS.md`.

Verify and observe:

```sh
systemctl --user list-timers agent-wiki-sweeper.timer
journalctl --user -u agent-wiki-sweeper -n 200
cat ~/.local/state/agent-wiki/last-run.log
```

Trigger a manual run (useful for first-time validation):

```sh
systemctl --user start agent-wiki-sweeper.service
# …or run the script directly outside of systemd:
deploy/run-daily.sh
```

Edit the cadence by changing `OnCalendar=` in the `.timer` file and
re-running `systemctl --user daemon-reload`.

## 8. Claude Code Stop-hook integration

When a Claude Code session ends in a project directory under your
`PROJECTS_ROOT`, fire a per-project sweep so the wiki stays current
with the work that just happened. The hook is debounced to **60 minutes
per project**, so a long active dev session doesn't trigger 20+ Claude
API calls — the daily timer (§7) is the backstop.

The two scripts live in `deploy/`:

- `sweep-on-stop.sh` — hook target. Reads JSON on stdin, extracts
  `cwd`, validates the project, debounces, then fires the sweep
  asynchronously via `systemd-run --user --no-block` so the hook
  returns immediately and never blocks the agent. Reads
  `PROJECTS_ROOT` from `service/.env`.
- `sweep-project.sh` — the actual per-project sweeper + reindexer.
  Invoked by the hook async path; also usable directly.

Wire it into `~/.claude/settings.json` by appending a `Stop` hook
entry pointing at the script in your checkout:

```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "/absolute/path/to/agent-wiki/deploy/sweep-on-stop.sh"
      }
    ]
  }
]
```

Validate the file parses:

```sh
python3 -c "import json; json.load(open('$HOME/.claude/settings.json'))"
```

State + logs land in `~/.local/state/agent-wiki/`:

- `stop-hook.log` — one line per Stop event (`queued <project>` or
  `skip <project>: swept Ns ago`).
- `last-sweep/<project>` — debounce stamp; mtime is the last queue time.
- `sweep-<project>.log` — appended sweeper + indexer output per project.

Verify and observe:

```sh
tail -f ~/.local/state/agent-wiki/stop-hook.log
journalctl --user -u 'agent-wiki-sweep-*' -f
```

Manual trigger (bypasses the hook entirely):

```sh
deploy/sweep-project.sh <project>
```

To temporarily disable the hook without editing settings.json, just
make the script non-executable:

```sh
chmod -x deploy/sweep-on-stop.sh
```

## Troubleshooting
- **"GOOGLE_CLIENT_ID is required in environment"** — `.env` not present
  or systemd `EnvironmentFile=` path wrong. Check `journalctl -u agent-wiki`.
- **OAuth redirects back with `?error=denied`** — your email isn't in
  `ALLOWED_EMAILS`. Add it (comma-separated), restart the service.
- **Reverse proxy 503** — service isn't running. `sudo systemctl status agent-wiki`.
- **`agent-wiki UI not built`** message in browser — you skipped step 1's
  `cd ui && npm run build`. The server checks for `ui/dist/index.html`.
- **Sweeper fails with "PROJECTS_ROOT must be set"** — set it in
  `service/.env` (see §3) so both the server and the sweeper can find it.
