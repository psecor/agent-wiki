# AGENTS.md spec — v1

This document defines what an `AGENTS.md` file looks like in a project that follows the agent-wiki standard. It is intentionally opinionated: predictable section names and ordering let agents patch one section at a time without rewriting the file.

The audience is humans first. Agents read the same doc humans do — there is no separate machine view.

---

## File location and name

- **Filename**: `AGENTS.md`, at the project root.
- **Why `AGENTS.md` and not `CLAUDE.md`**: `AGENTS.md` is the emerging cross-runtime convention (Claude Code, Codex, others). For Claude-Code-only projects, also include a one-line `CLAUDE.md` stub: `@AGENTS.md`. This keeps Claude's auto-loading behavior while preserving the cross-runtime source of truth.
- **README.md**: keep it. `README.md` is for the project's external face (what it is, how to use it). `AGENTS.md` is for working *on* it. Some content overlaps; that's fine — link, don't sync.

---

## Frontmatter

Every `AGENTS.md` starts with YAML frontmatter:

```yaml
---
project: my-cool-project
status: production            # production | in-progress | experimental | archived
status_description: "Live at example.com/cool-project; feature-stable, occasional small adds."
last_updated: 2026-04-25
last_updated_by:
  - agent:claude-opus-4-7
  - human:yourname
wiki_schema_version: 1
---
```

**Field rules:**

- `project` — short slug, matches the directory name when possible.
- `status` — single word, one of the four. Drives whether the wiki service treats the project as active.
- `status_description` — one sentence of free text. The enum gives machines a routing signal; the description gives humans and agents the nuance the enum can't capture (what's stable, what's not, where it's deployed).
- `last_updated` — ISO date (YYYY-MM-DD) of the most recent change reflected in the doc.
- `last_updated_by` — list of authors who touched the doc in this update round. Each entry is prefixed `agent:` or `human:` followed by a stable identifier (model id for agents, handle for humans). Order doesn't matter. A single edit by a single author is still a list of one.
- `wiki_schema_version` — integer; bump when this spec changes incompatibly.

**Not in frontmatter** (derived, not authored):

- `links_out` — outbound links from this file. These are already inline in the markdown body (`[label](path)` in the Related section, in gotchas, anywhere). Duplicating them into frontmatter would create two sources of truth for the same fact. The service extracts them from the body and records them in `agent-wiki/index/projects.json` for query convenience.
- `links_in` — backlinks from other projects/topics. By definition computed from *other* files — project B can't know what links to it without a cross-project scan. Storing them in B's frontmatter would either require cross-project writes on every edit (fragile) or service backfill (in which case the source copy is just a stale snapshot of the index). They live in `agent-wiki/index/projects.json` and are surfaced in the doc via the generated backlinks footer (see [Generated backlinks footer](#generated-backlinks-footer) below).
- `staleness_score` — computed from time + repo activity since `last_updated`.

---

## Generated backlinks footer

To preserve the "doc is self-contained when read on GitHub or in an editor" property without making humans or agents author backlinks by hand, the wiki service maintains a generated block at the bottom of each `AGENTS.md`:

```markdown
<!-- agent-wiki:backlinks-start -->
**Linked from:**
- [rssreader](../rssreader/AGENTS.md#gotchas) — bit it during the 2026-Q1 schema change
- [topics/postgres-jsonb-ordering](../agent-wiki/topics/postgres-jsonb-ordering.md)
<!-- agent-wiki:backlinks-end -->
```

**Rules:**

- The marker comments are load-bearing. Everything between them is owned by the service and will be overwritten on the next sweep.
- If the block is absent, the service inserts it at the end of the file on the next update.
- Authors should not edit content between the markers. Edits to backlinks must happen at the *source* — in the `AGENTS.md` (or topic file) that emits the link.
- An empty backlinks list is rendered as `_No incoming links yet._` between the markers; the markers are kept so the next sweep finds them.

---

## Section structure

Sections appear in this order. **Skip any section that doesn't apply** — don't leave empty headings. The wiki service treats "section absent" and "section present but empty" as the same signal: not applicable.

Headings are H2 (`##`). Subsection headings are H3+. Don't introduce new H2s outside this list — they break the "patch one section" property.

### 1. What This Is

One paragraph. What does the project do, who is it for, what problem does it solve. If there's a public URL, name it here.

### 2. Status

Done in one paragraph or a short two-column "implemented / not yet" list. Mirrors the `status` frontmatter but with detail. Lets a reader (human or agent) calibrate trust before reading further.

### 3. Domain Model

**Optional** — include only when the domain has non-obvious concepts that the rest of the doc would be confusing without. Example: colonization-cargo-tracker's two-phase carrier flow. Skip for CRUD apps where the data model speaks for itself.

### 4. Repository Layout

An annotated file tree. Annotate every directory and any file whose purpose isn't obvious from its name. Use comments to right of the tree, not separate prose.

### 5. Architecture

How the pieces fit. Include a small ASCII diagram if request/data flow matters. Call out trade-offs where a non-obvious choice was made — phrase as **Trade-off:** *what we chose / what we gave up / why*.

### 6. Data & Schema

For database-backed projects: a table of models with key fields and notable constraints. Include schema-change conventions (e.g. "don't use `prisma migrate dev` here — see #11"). Skip if the project has no persistent data.

### 7. Configuration

Environment variables and other runtime config. Group by service. Note which are secrets (don't include values), which are public, and which differ between dev and prod.

### 8. Build, Run, Deploy

Standard commands, copy-pasteable. Include the post-deploy verification step where one exists. If the project has a deploy script, name it and say whether it has been exercised end-to-end.

### 9. Observability & Maintenance

Where the logs are, how to tail them, how to check the service is up, what to do when it isn't. Include common operational tasks (rotating a secret, reseeding data, restarting after a config change).

### 10. Integration Surfaces

**Optional** — for projects that expose APIs, webhooks, real-time events, or are consumed by other projects. Tabular: event/endpoint, payload shape, when emitted/expected.

### 11. Gotchas

The single most valuable section. Numbered list of things that are easy to get wrong, each one to three sentences. Each gotcha should be specific enough that an agent encountering the situation can recognize it. This is the prime cross-link target.

Format: each item gets a short bold lede, then explanation.

```
1. **Favicon paths in `public/index.html`** — must use `%PUBLIC_URL%/...`,
   not `/...`. A hardcoded `/favicon.svg` resolves to the domain root,
   not the subpath.
```

### 12. Related

Two subsections:

- **Other projects** — projects that depend on this, that this depends on, or that solve adjacent problems. Format: `- [project-name](../project-name/AGENTS.md) — relationship in one phrase`.
- **Topics** — links into `agent-wiki/topics/` for cross-cutting knowledge this project uses. Format: `- [topic name](../agent-wiki/topics/<slug>.md) — why it's relevant here`.

---

## Link conventions

**Within a project's wiki**: anchor links to its own headings, e.g. `[see #11](#gotchas)`.

**Cross-project**: filesystem-relative paths, assuming all projects and `agent-wiki/` are sibling directories under `~/termag/projects/`:

```markdown
[rssreader's OAuth notes](../rssreader/AGENTS.md#configuration)
```

**Topic links**: filesystem-relative into `agent-wiki/topics/`:

```markdown
[Postgres jsonb ordering](../agent-wiki/topics/postgres-jsonb-ordering.md)
```

The wiki service validates that every cross-link target exists. Broken links are flagged in the staleness report.

---

## Section-level patching

Because section headings are stable and unique within the file, an agent (or the wiki service) can update a single section by replacing the text between two H2 markers. The spec guarantees:

- Each H2 from the canonical list appears at most once.
- Sections appear in the canonical order.
- No H2s outside the canonical list.

This invariant is what lets the maintenance service make small, focused updates instead of rewriting the whole doc.

---

## Versioning

`wiki_schema_version: 1` today. The version bumps when:

- A canonical H2 is renamed, added, or removed.
- A frontmatter field is renamed, added, or removed.
- Link conventions change in a non-backwards-compatible way.

The wiki service will be able to migrate older versions forward.

---

## Examples to study

These existing project docs predate the spec but are good source material:

- `~/termag/projects/colonization-cargo-tracker/CLAUDE.md` — strongest "Domain Model" section; rich "Things That Are Easy to Get Wrong"
- `~/termag/projects/rssreader/CLAUDE.md` — clean architecture + deploy sections; excellent gotchas list

When migrating one of these to the spec: the existing content maps cleanly onto sections 1, 4, 5, 6, 7, 8, 10, 11, with minimal rewriting.
