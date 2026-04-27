# agent-wiki

A documentation standard and (eventually) a maintenance service for **per-project agent-readable wikis**. Each project under `~/termag/projects/` (and any project that opts in) gets a single `AGENTS.md` at its root that describes intent, architecture, deployment, gotchas, and links to related work — written for humans first, but structured so that AI agents can read, navigate, and update it reliably.

This repo holds:

- The **spec** for what an `AGENTS.md` looks like ([spec/schema.md](spec/schema.md))
- A copy-paste **template** for new projects ([spec/template.md](spec/template.md))
- The **topics tier** — cross-cutting knowledge that doesn't belong to any one project ([topics/](topics/))
- (Future) A **service** that keeps wikis fresh, propagates cross-project insights, and rebuilds the cross-project index

## Status

**Spec-only.** The service is not yet built. For now, wikis are written and updated by hand (or by an agent invoked manually). The intent is to graduate to automated maintenance once the spec is proven against 3–5 real projects.

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
