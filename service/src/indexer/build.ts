// Orchestrates the full index build: discover → parse → validate → write JSON.

import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument, slugify } from "./parse.js";
import type { Source } from "./sources/types.js";
import {
  type BacklinkEntry,
  type BacklinksIndex,
  type ProjectIndexEntry,
  type ProjectsIndex,
  type SearchEntry,
  type SearchIndex,
  type TopicIndexEntry,
  type TopicsIndex,
  type ValidationIssue,
  type ValidationReport,
  type UnmigratedEntry,
} from "./types.js";
import { summarize, validateProjectDoc, validateTopicDoc } from "./validate.js";

export interface BuildOptions {
  source: Source;
  outDir: string;        // absolute path where index/*.json files are written
}

export interface BuildResult {
  projects: ProjectsIndex;
  topics: TopicsIndex;
  backlinks: BacklinksIndex;
  search: SearchIndex;
  validation: ValidationReport;
}

export async function build(opts: BuildOptions): Promise<BuildResult> {
  const { source, outDir } = opts;
  const generatedAt = new Date().toISOString();

  const discovered = await source.discover();

  // Read + parse every doc, then resolve all links so validation can flag broken ones.
  const parsedDocs = await Promise.all(
    discovered
      .filter(d => d.kind === "project-agents-md" || d.kind === "topic")
      .map(async d => {
        const raw = await source.read(d);
        const parsed = parseDocument(d.relativePath, d.id, raw);
        return { discovered: d, parsed };
      }),
  );

  // Resolve every outbound link once, build a map keyed by (fromDoc, target) for validation,
  // and a separate map keyed by target → resolved relativePath for the backlinks pass.
  const resolvedPerDoc = new Map<string, Map<string, string | null>>();
  for (const { discovered: d, parsed } of parsedDocs) {
    const map = new Map<string, string | null>();
    for (const link of parsed.links) {
      if (!map.has(link.target)) {
        map.set(link.target, await source.resolveLink(d, link.target));
      }
    }
    resolvedPerDoc.set(d.relativePath, map);
  }

  // Build the projects index.
  const projects: ProjectIndexEntry[] = [];
  const topics: TopicIndexEntry[] = [];
  const issues: ValidationIssue[] = [];
  const searchEntries: SearchEntry[] = [];
  const backlinks: Record<string, BacklinkEntry[]> = {};

  for (const { discovered: d, parsed } of parsedDocs) {
    const links = parsed.links;
    const resolved = resolvedPerDoc.get(d.relativePath)!;

    if (d.kind === "project-agents-md") {
      projects.push({
        name: d.slug,
        path: path.dirname(d.id),
        agentsMdPath: d.id,
        relativePath: d.relativePath,
        frontmatter: parsed.frontmatter,
        sections: parsed.sections.map(s => ({
          name: s.heading,
          slug: slugify(s.heading),
          charCount: s.body.length,
        })),
        linksOut: links,
      });
      issues.push(...validateProjectDoc(parsed, resolved));
    } else {
      // topic
      topics.push({
        slug: d.slug,
        relativePath: d.relativePath,
        absolutePath: d.id,
        frontmatter: parsed.frontmatter,
        sections: parsed.sections.map(s => ({
          name: s.heading,
          slug: slugify(s.heading),
          charCount: s.body.length,
        })),
        linksOut: links,
      });
      issues.push(...validateTopicDoc(parsed, resolved));
    }

    // Search entries: one per section.
    for (const section of parsed.sections) {
      searchEntries.push({
        id: `${d.relativePath}#${slugify(section.heading)}`,
        doc: d.relativePath,
        docKind: d.kind === "topic" ? "topic" : "project",
        ...(d.kind === "topic" ? { topic: d.slug } : { project: d.slug }),
        section: section.heading,
        body: lightStrip(section.body),
      });
    }

    // Backlinks: walk this doc's resolved links and record an entry on each target.
    for (const link of links) {
      const target = resolved.get(link.target);
      if (!target) continue;
      if (!backlinks[target]) backlinks[target] = [];
      backlinks[target].push({
        from: d.relativePath,
        fromSection: link.fromSection,
        label: link.label,
      });
    }
  }

  const unmigrated: UnmigratedEntry[] = discovered
    .filter(d => d.kind === "unmigrated")
    .map(d => ({
      name: d.slug,
      path: d.id,
      has: d.legacyFiles ?? [],
    }));

  const projectsIndex: ProjectsIndex = {
    schema_version: 1,
    generated_at: generatedAt,
    projects,
    unmigrated,
  };

  const topicsIndex: TopicsIndex = {
    schema_version: 1,
    generated_at: generatedAt,
    topics,
  };

  const backlinksIndex: BacklinksIndex = {
    schema_version: 1,
    generated_at: generatedAt,
    backlinks,
  };

  const searchIndex: SearchIndex = {
    schema_version: 1,
    generated_at: generatedAt,
    entries: searchEntries,
  };

  const validation: ValidationReport = {
    schema_version: 1,
    generated_at: generatedAt,
    issues,
    summary: summarize(issues),
  };

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(outDir, "projects.json"), projectsIndex),
    writeJson(path.join(outDir, "topics.json"), topicsIndex),
    writeJson(path.join(outDir, "backlinks.json"), backlinksIndex),
    writeJson(path.join(outDir, "search.json"), searchIndex),
    writeJson(path.join(outDir, "validation.json"), validation),
  ]);

  return {
    projects: projectsIndex,
    topics: topicsIndex,
    backlinks: backlinksIndex,
    search: searchIndex,
    validation,
  };
}

async function writeJson(p: string, obj: unknown): Promise<void> {
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// Lightly strip markdown for search bodies. Not a full parser — just removes the
// noisiest syntax so substring/fuzzy search has clean text to work with. Code block
// CONTENT is preserved (only the fences are stripped) so things like Apache configs
// or env-var names remain searchable.
function lightStrip(s: string): string {
  return s
    .replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, "$1") // strip fences, keep code
    .replace(/`([^`]+)`/g, "$1")                          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")              // [label](href) → label
    .replace(/[*_~]/g, "")                                // emphasis markers
    .replace(/\s+/g, " ")
    .trim();
}
