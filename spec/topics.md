# Topics — cross-cutting knowledge

`agent-wiki/topics/` holds knowledge that doesn't belong to any one project. Each topic is one markdown file under `topics/`, named with a kebab-case slug (`postgres-jsonb-ordering.md`, `react-subpath-deployment.md`, `apache-proxy-wstunnel.md`).

Topics are the second tier of the wiki. The first tier — per-project `AGENTS.md` — owns project-specific knowledge. Topics own knowledge that applies to multiple projects, or that is general enough to outlive any single project.

---

## When to use a topic vs a project's gotcha

A piece of knowledge belongs in a project's `AGENTS.md` "Gotchas" section when:

- It only applies to that project.
- It refers to a specific file path, table, or service in that project.
- A reader working in another project would have no use for it.

It belongs in `topics/` when **at least two of these are true**:

- Multiple projects in `~/termag/projects/` could hit the same issue.
- The knowledge is about a *technology* or *pattern*, not a specific project's code.
- An agent working in *any* project might want to consult it.

When in doubt, write the gotcha in the project first. If a second project hits the same thing, the wiki service (or a human) promotes it to a topic and replaces the duplicates with links.

---

## Topic file structure

Topics use the same single-file convention as `AGENTS.md`, but with a smaller section set:

```markdown
---
topic: postgres-jsonb-ordering
last_updated: YYYY-MM-DD
last_updated_by:
  - agent:<model-id>
  - human:<handle>
applies_to: [rssreader, colonization-cargo-tracker]   # known projects
wiki_schema_version: 1
---

# <Topic title>

## Summary

<One paragraph. The pitfall, pattern, or fact in plain language.>

## Detail

<As much as needed. Code samples, commands, links to authoritative
external docs.>

## Why it matters

<What goes wrong if you don't know this. Concrete failure modes.>

<!-- agent-wiki:backlinks-start -->
**Seen in:**
- [rssreader](../../rssreader/AGENTS.md#gotchas) — bit it during the 2026-Q1 schema change
- [colonization-cargo-tracker](../../colonization-cargo-tracker/AGENTS.md) — surfaced during initial schema design
<!-- agent-wiki:backlinks-end -->
```

The backlinks footer in topic files uses the same marker convention as project files. The "Seen in" list is rebuilt by the service on each sweep — don't edit it by hand. Edits to which projects link to a topic must happen in those projects' `AGENTS.md` "Related → Topics" sections.

---

## Promotion workflow

When the second project encounters knowledge that already exists as a project gotcha elsewhere:

1. Create `topics/<slug>.md` with the consolidated explanation.
2. Replace the duplicate gotcha entries in each project's `AGENTS.md` with a one-line link to the topic, kept under "Related → Topics".
3. The wiki service rebuilds backlinks; the topic's "Seen in" list reflects which projects link to it.

The promotion does not delete the project-specific framing if it adds value — the project's gotcha can stay as a one-liner that links to the topic for the general explanation: `**X gotcha** — happens here when Y; see [topics/x.md](../agent-wiki/topics/x.md) for the general case`.

---

## Naming and scope

- One concept per file. If a topic file grows past ~200 lines, split it.
- Slugs use the technology or pattern name, not the symptom. `postgres-jsonb-ordering` not `data-comes-back-in-wrong-order`.
- Avoid topics that duplicate well-maintained external docs. The point is *workspace-specific* knowledge — the things that bit *us*, in our combination of stack and conventions.
