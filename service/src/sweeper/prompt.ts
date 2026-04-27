// Build the system + user prompts that drive a sweep of one project's AGENTS.md.

import { readFileSync } from "node:fs";
import { CANONICAL_SECTIONS } from "../indexer/types.js";
import type { GatheredProject } from "./gather.js";

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(specPath: string, project: GatheredProject): BuiltPrompt {
  const spec = readFileSync(specPath, "utf8");

  const system = [
    "You are the agent-wiki sweeper. You maintain per-project AGENTS.md files",
    "to a strict spec. Your job: given a project's current AGENTS.md and a",
    "summary of git activity since it was last updated, propose surgical",
    "section-level updates that bring the doc back into alignment with reality.",
    "",
    "Hard rules:",
    "- NEVER invent new H2 headings. Only edit existing canonical sections.",
    `- Canonical H2 set: ${CANONICAL_SECTIONS.map((s) => `"${s}"`).join(", ")}.`,
    "- Edit ONLY the body between two H2 headings. Heading text stays exactly as-is.",
    "- Do not touch the backlinks footer (between the agent-wiki:backlinks-* markers).",
    "- Do not touch frontmatter directly. Use the response fields for status changes.",
    "- If a section is still accurate, omit it from `updates`. Only return sections you actually changed.",
    "- If nothing in the doc needs updating, set `no_changes_needed: true` and `updates: []`.",
    "- Prefer small, targeted edits over rewrites. Preserve the voice and density of existing prose.",
    "- New gotchas should land in the Gotchas section, not invented elsewhere.",
    "- Architecture/Repo-Layout updates should reflect actual file moves, not speculative plans.",
    "",
    "Output format:",
    "Respond with a single raw JSON object — start with `{` and end with `}`.",
    "Do NOT wrap it in a code fence (no ```json ... ```), and write no prose outside the object.",
    "Bodies will frequently contain markdown code fences themselves; wrapping the whole",
    "response in another fence breaks parsing.",
    "Schema:",
    "{",
    '  "reasoning": "<one paragraph: what you changed and why>",',
    '  "no_changes_needed": <boolean>,',
    '  "updates": [ { "section": "<canonical heading>", "body": "<full new body markdown>" } ],',
    '  "new_status_description": "<sentence>" | null,',
    '  "new_status": "production" | "in-progress" | "experimental" | "archived" | null',
    "}",
  ].join("\n");

  const activitySummary = formatActivity(project);

  const user = [
    `# Project: ${project.name}`,
    "",
    "## Current AGENTS.md",
    "",
    "```markdown",
    project.raw,
    "```",
    "",
    "## Git activity since last sweep",
    "",
    activitySummary,
    "",
    "## Reference: agent-wiki spec (schema.md)",
    "",
    "```markdown",
    spec,
    "```",
    "",
    "Now propose updates. Remember: only edit canonical sections, omit sections that are still accurate, return JSON only.",
  ].join("\n");

  return { system, user };
}

function formatActivity(project: GatheredProject): string {
  const a = project.activity;
  if (a.commits.length === 0) {
    return `_No commits since ${a.since}._`;
  }
  const lines: string[] = [];
  lines.push(`Last updated: ${project.lastUpdated}. ${a.commits.length} commit(s) since.`);
  lines.push("");
  lines.push("### Commits (oldest → newest)");
  for (const c of a.commits) {
    lines.push(`- ${c.date.slice(0, 10)} ${c.hash} ${c.subject} _(${c.author})_`);
  }
  lines.push("");
  lines.push("### Diffstat");
  lines.push("```");
  lines.push(a.diffstat.trim() || "(empty)");
  lines.push("```");
  if (a.changedFiles.length > 0 && a.changedFiles.length <= 80) {
    lines.push("");
    lines.push("### Changed files");
    for (const f of a.changedFiles) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}
