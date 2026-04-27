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

You can re-run the indexer manually after AGENTS.md edits:

```sh
cd ~/termag/projects/agent-wiki/service
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

```sh
# Install the unit files into the user systemd config.
mkdir -p ~/.config/systemd/user
cp ~/termag/projects/agent-wiki/deploy/agent-wiki-sweeper.service \
   ~/termag/projects/agent-wiki/deploy/agent-wiki-sweeper.timer \
   ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now agent-wiki-sweeper.timer

# So the timer fires even when you're not logged in:
sudo loginctl enable-linger "$USER"
```

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
~/termag/projects/agent-wiki/deploy/run-daily.sh
```

Edit the cadence by changing `OnCalendar=` in the `.timer` file and
re-running `systemctl --user daemon-reload`.

## 8. Claude Code Stop-hook integration

When a Claude Code session ends in a `~/termag/projects/<project>/`
directory, fire a per-project sweep so the wiki stays current with the
work that just happened. The hook is debounced to **60 minutes per
project**, so a long active dev session doesn't trigger 20+ Claude API
calls — the daily timer (§7) is the backstop.

The two scripts live in `deploy/`:

- `sweep-on-stop.sh` — hook target. Reads JSON on stdin, extracts
  `cwd`, validates the project, debounces, then fires the sweep
  asynchronously via `systemd-run --user --no-block` so the hook
  returns immediately and never blocks the agent.
- `sweep-project.sh` — the actual per-project sweeper + reindexer.
  Invoked by the hook async path; also usable directly.

Wire it into `~/.claude/settings.json` by appending a third entry to
the existing `Stop` hook block:

```json
"Stop": [
  {
    "hooks": [
      { "type": "command", "command": "..." },
      { "type": "command", "command": "..." },
      {
        "type": "command",
        "command": "/home/secorp/termag/projects/agent-wiki/deploy/sweep-on-stop.sh"
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
~/termag/projects/agent-wiki/deploy/sweep-project.sh <project>
```

To temporarily disable the hook without editing settings.json, just
make the script non-executable:

```sh
chmod -x ~/termag/projects/agent-wiki/deploy/sweep-on-stop.sh
```

## Troubleshooting
- **"GOOGLE_CLIENT_ID is required in environment"** — `.env` not present
  or systemd `EnvironmentFile=` path wrong. Check `journalctl -u agent-wiki`.
- **OAuth redirects back with `?error=denied`** — your email isn't in
  `ALLOWED_EMAILS`. Add it (comma-separated), restart the service.
- **Apache 503** — service isn't running. `sudo systemctl status agent-wiki`.
- **`agent-wiki UI not built`** message in browser — you skipped step 1's
  `cd ui && npm run build`. The server checks for `ui/dist/index.html`.
