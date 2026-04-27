// Parse a wiki document: frontmatter, sections (split on H2), and outbound links.

import matter from "gray-matter";
import type { Frontmatter, ParsedDocument, ParsedLink, ParsedSection } from "./types.js";

const H2_RE = /^##\s+(.+?)\s*$/;
// Standard markdown link: [label](target). Greedy enough for our spec, not a full parser.
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
// Backlinks footer markers — we deliberately exclude content between them from
// section bodies (the service generates that block; it's not authored content).
const BACKLINKS_START = "<!-- agent-wiki:backlinks-start -->";
const BACKLINKS_END = "<!-- agent-wiki:backlinks-end -->";

export function parseDocument(
  relativePath: string,
  absolutePath: string,
  raw: string,
): ParsedDocument {
  const { frontmatter, frontmatterError, body } = parseFrontmatter(raw);
  const sections = splitSections(body);
  const links = extractLinks(body, sections);

  return {
    relativePath,
    absolutePath,
    raw,
    frontmatter,
    frontmatterError,
    sections,
    links,
  };
}

function parseFrontmatter(raw: string): {
  frontmatter: Frontmatter | null;
  frontmatterError: string | null;
  body: string;
} {
  try {
    const parsed = matter(raw);
    if (!parsed.data || Object.keys(parsed.data).length === 0) {
      return { frontmatter: null, frontmatterError: "no frontmatter found", body: parsed.content };
    }
    normalizeDates(parsed.data);
    // Permissive cast — validate.ts will check field-level correctness.
    return {
      frontmatter: parsed.data as unknown as Frontmatter,
      frontmatterError: null,
      body: parsed.content,
    };
  } catch (err) {
    return {
      frontmatter: null,
      frontmatterError: err instanceof Error ? err.message : String(err),
      body: raw,
    };
  }
}

// gray-matter parses YAML dates natively into Date objects. The spec stores
// dates as YYYY-MM-DD strings — normalize so the index is consistent and the
// date-format validator can see what's actually written.
function normalizeDates(data: Record<string, unknown>): void {
  for (const key of ["last_updated"]) {
    const v = data[key];
    if (v instanceof Date) data[key] = v.toISOString().slice(0, 10);
  }
}

function splitSections(body: string): ParsedSection[] {
  const lines = body.split("\n");
  const sections: ParsedSection[] = [];
  let current: { heading: string; startLine: number; bodyLines: string[] } | null = null;
  let inBacklinks = false;

  const flush = (endLine: number) => {
    if (!current) return;
    sections.push({
      heading: current.heading,
      level: 2,
      startLine: current.startLine,
      endLine,
      body: current.bodyLines.join("\n").trim(),
    });
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(BACKLINKS_START)) inBacklinks = true;
    if (line.includes(BACKLINKS_END)) {
      inBacklinks = false;
      continue;
    }
    if (inBacklinks) continue;

    const m = H2_RE.exec(line);
    if (m) {
      flush(i);
      current = { heading: m[1]!.trim(), startLine: i + 1, bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  flush(lines.length);
  return sections;
}

function extractLinks(body: string, sections: ParsedSection[]): ParsedLink[] {
  const out: ParsedLink[] = [];
  // Build a line→section index for "fromSection" attribution.
  const lineToSection = new Map<number, string>();
  for (const s of sections) {
    for (let l = s.startLine; l <= s.endLine; l++) lineToSection.set(l, s.heading);
  }

  const lines = body.split("\n");
  let inBacklinks = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip the auto-generated backlinks block — otherwise its rendered links
    // would feed back into the next indexer pass as new outbound links.
    if (line.includes(BACKLINKS_START)) { inBacklinks = true; continue; }
    if (line.includes(BACKLINKS_END)) { inBacklinks = false; continue; }
    if (inBacklinks) continue;

    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(line)) !== null) {
      out.push({
        label: m[1]!,
        target: m[2]!,
        fromSection: lineToSection.get(i + 1) ?? null,
      });
    }
  }
  return out;
}

export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
