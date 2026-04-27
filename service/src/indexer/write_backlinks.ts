// Render the backlinks index into each project's AGENTS.md, replacing the body
// between <!-- agent-wiki:backlinks-start --> and <!-- agent-wiki:backlinks-end -->.
//
// Mechanically generated and idempotent: never touches frontmatter or any other
// section, so re-running doesn't bump `last_updated` or otherwise churn the doc.
// Files without markers are skipped with a warning (markers are part of the
// migration template; missing markers means the file pre-dates the convention).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { BacklinkEntry, ProjectIndexEntry } from "./types.js";

const START = "<!-- agent-wiki:backlinks-start -->";
const END = "<!-- agent-wiki:backlinks-end -->";
const EMPTY = "_No incoming links yet._";

export interface WriteBacklinksResult {
  updated: string[];   // relativePath of files whose markers' body changed
  unchanged: string[]; // relativePath of files where rendered text matched existing
  skipped: string[];   // relativePath of files missing one/both markers
}

export async function writeBacklinks(
  projects: ProjectIndexEntry[],
  backlinks: Record<string, BacklinkEntry[]>,
): Promise<WriteBacklinksResult> {
  const updated: string[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];

  for (const project of projects) {
    const incoming = backlinks[project.relativePath] ?? [];
    const rendered = renderBacklinks(project.relativePath, incoming);
    const result = await rewriteBetweenMarkers(project.agentsMdPath, rendered);
    if (result === "skipped") skipped.push(project.relativePath);
    else if (result === "updated") updated.push(project.relativePath);
    else unchanged.push(project.relativePath);
  }

  return { updated, unchanged, skipped };
}

// Render markdown for a single doc's incoming links. Group by source project
// (dirname of `from`), list distinct sections per source, sort alphabetically
// for stable output.
export function renderBacklinks(targetRelPath: string, entries: BacklinkEntry[]): string {
  if (entries.length === 0) return EMPTY;

  const targetProject = path.dirname(targetRelPath);

  // Group by source project (from-doc dirname), preserving section order of first appearance.
  const bySource = new Map<string, { sections: string[]; sectionSet: Set<string> }>();
  for (const entry of entries) {
    const sourceProject = path.dirname(entry.from);
    if (sourceProject === targetProject) continue; // skip self-references
    let bucket = bySource.get(sourceProject);
    if (!bucket) {
      bucket = { sections: [], sectionSet: new Set() };
      bySource.set(sourceProject, bucket);
    }
    const sec = entry.fromSection ?? "(unknown)";
    if (!bucket.sectionSet.has(sec)) {
      bucket.sectionSet.add(sec);
      bucket.sections.push(sec);
    }
  }

  if (bySource.size === 0) return EMPTY;

  const sortedSources = [...bySource.keys()].sort();
  const lines = sortedSources.map((source) => {
    const bucket = bySource.get(source)!;
    const href = path.posix.join("..", source, "AGENTS.md");
    return `- [${source}](${href}) — ${bucket.sections.join(", ")}`;
  });
  return lines.join("\n");
}

type RewriteOutcome = "updated" | "unchanged" | "skipped";

async function rewriteBetweenMarkers(
  filePath: string,
  rendered: string,
): Promise<RewriteOutcome> {
  const raw = await fs.readFile(filePath, "utf8");
  const startIdx = raw.indexOf(START);
  const endIdx = raw.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return "skipped";

  // Anchor the replacement to the newlines around each marker so we don't
  // alter the marker lines themselves or the blank line that visually frames them.
  const startLineEnd = raw.indexOf("\n", startIdx);
  if (startLineEnd === -1) return "skipped";

  // The body is everything strictly between the two marker lines. We keep one
  // newline immediately after START, then `rendered`, then one newline before END.
  const before = raw.slice(0, startLineEnd + 1);
  const after = raw.slice(endIdx);
  const next = `${before}${rendered}\n${after}`;

  if (next === raw) return "unchanged";
  await fs.writeFile(filePath, next, "utf8");
  return "updated";
}
