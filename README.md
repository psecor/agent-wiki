# agent-wiki

A documentation standard and a maintenance service for **per-project agent-readable wikis**. Each project in your workspace gets a single `AGENTS.md` at its root that describes intent, architecture, deployment, gotchas, and links to related work — written for humans first, but structured so that AI agents can read, navigate, and update it reliably.

This repo holds:

- The **spec** for what an `AGENTS.md` looks like ([spec/schema.md](spec/schema.md))
- A copy-paste **template** for new projects ([spec/template.md](spec/template.md))
- The **topics tier** — cross-cutting knowledge that doesn't belong to any one project ([topics/](topics/))
- A **service** (`service/`) that runs a small Express app exposing a read-only browser/API of all your project wikis, plus a sweeper that uses Claude to keep each `AGENTS.md` in sync with recent git activity
- A **UI** (`ui/`) — React frontend served by the same service

## Status

**Working.** The spec is stable, the service runs in production for the maintainer's project tree, and the daily sweeper has been keeping ~17 project wikis fresh. Topics tier is scaffolded but mostly empty — populate as cross-cutting knowledge surfaces.

## Prerequisites

- **Node.js** 20+
- **Anthropic API key** (only needed if you want the sweeper to auto-maintain `AGENTS.md` files — the spec and template work standalone)
- **Apache** with `mod_proxy`, `mod_proxy_http`, `mod_headers` (or another reverse proxy) — only needed if you want to serve the browser UI publicly behind HTTPS
- **Google OAuth client** — only needed if you want sign-in protection on the browser UI

## Why this exists

Agents that work in a codebase repeatedly re-derive the same context — what a project does, how it's deployed, which patterns are surprising. A consistent, opinionated doc per project lets:

- A new agent session land with full context in one read
- Cross-project work cite real prior knowledge instead of re-discovering it
- Humans skim the same doc to onboard or review

The standard is opinionated on purpose. Predictable section names mean agents can patch a single section without rewriting the file.

## How to add a wiki to your project

1. Copy [spec/template.md](spec/template.md) to `<your-project>/AGENTS.md`
2. Fill in the sections that apply; delete the ones that don't
3. Commit it like any other code change

When the service ships, it will keep this file fresh; until then, treat it like any other living doc.

## Related

- [spec/schema.md](spec/schema.md) — full spec (sections, frontmatter, link conventions)
- [spec/template.md](spec/template.md) — starter file
- [spec/topics.md](spec/topics.md) — when content belongs in `topics/` vs in a project's `AGENTS.md`
- [AGENTS.md](AGENTS.md) — this repo's own agent-readable wiki (eats its own dog food)
