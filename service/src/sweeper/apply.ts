// Apply a SweeperResponse to a project's AGENTS.md content.
// Section-level only: replace the body between two H2s. Heading text is preserved.
// Frontmatter is mutated in place via targeted regex replacements (not via
// gray-matter.stringify) so unrelated fields keep their original whitespace,
// quoting, and casing — otherwise every sweep produces frontmatter churn.

import type { SweeperResponse } from "./types.js";

const H2_RE = /^##\s+(.+?)\s*$/;
const BACKLINKS_START = "<!-- agent-wiki:backlinks-start -->";
const BACKLINKS_END = "<!-- agent-wiki:backlinks-end -->";

export interface ApplyResult {
  next: string;
  applied: string[];   // sections that were actually changed
  skipped: string[];   // updates whose section heading wasn't found
}

export function applyResponse(
  raw: string,
  response: SweeperResponse,
  authorAgent: string,
  today: string,
): ApplyResult {
  const split = splitFrontmatter(raw);
  let body = split.body;

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const update of response.updates) {
    const result = replaceSectionBody(body, update.section, update.body);
    if (result === null) {
      skipped.push(update.section);
      continue;
    }
    if (result !== body) applied.push(update.section);
    body = result;
  }

  const fmChanged =
    response.new_status_description !== null ||
    response.new_status !== null ||
    applied.length > 0;

  let frontmatter = split.frontmatter;
  if (fmChanged) {
    if (response.new_status_description) {
      frontmatter = setScalarField(frontmatter, "status_description", response.new_status_description);
    }
    if (response.new_status) {
      frontmatter = setScalarField(frontmatter, "status", response.new_status);
    }
    frontmatter = setScalarField(frontmatter, "last_updated", today);
    frontmatter = ensureListItem(frontmatter, "last_updated_by", authorAgent);
  }

  const next = fmChanged ? `---\n${frontmatter}---\n${body}` : raw;
  return { next, applied, skipped };
}

interface SplitDoc {
  frontmatter: string;  // text between the leading --- and closing --- (no markers)
  body: string;         // text after the closing --- newline
}

function splitFrontmatter(raw: string): SplitDoc {
  // Match leading `---\n...\n---\n`. Tolerant of CRLF.
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { frontmatter: "", body: raw };
  return {
    frontmatter: m[1]! + "\n",  // keep trailing newline so concatenation matches original shape
    body: raw.slice(m[0].length),
  };
}

// Replace `field: <oldvalue>` (single-line scalar). Preserves any existing
// quoting style by writing the new value with the *same* surrounding quotes
// the old value used (none / "..." / '...'). If the field is missing, append it.
function setScalarField(frontmatter: string, field: string, value: string): string {
  const re = new RegExp(`^(${escapeRe(field)}:\\s*)("?'?)(.*?)\\2(\\s*)$`, "m");
  const match = re.exec(frontmatter);
  if (!match) {
    // Append at end with no surrounding quotes if value is YAML-safe.
    const safe = isYamlSafeScalar(value);
    return frontmatter.replace(/\n*$/, "\n") + `${field}: ${safe ? value : JSON.stringify(value)}\n`;
  }
  const prefix = match[1]!;
  const quote = match[2]!;
  const trailing = match[4]!;
  return frontmatter.replace(re, `${prefix}${quote}${value}${quote}${trailing}`);
}

// Append `- value` to the YAML block sequence under `field:` if not already present.
// Block sequences look like:
//   field:
//     - first
//     - second
function ensureListItem(frontmatter: string, field: string, value: string): string {
  const blockRe = new RegExp(
    `(^${escapeRe(field)}:[ \\t]*\\r?\\n)((?:[ \\t]+-[^\\n]*\\r?\\n)*)`,
    "m",
  );
  const m = blockRe.exec(frontmatter);
  if (!m) {
    // Field is missing or inline-style; append a fresh block.
    return frontmatter.replace(/\n*$/, "\n") + `${field}:\n  - ${value}\n`;
  }
  const items = m[2]!;
  // Already present?
  const itemRe = new RegExp(`^[ \\t]+-[ \\t]*"?'?${escapeRe(value)}"?'?[ \\t]*\\r?\\n`, "m");
  if (itemRe.test(items)) return frontmatter;
  // Detect indent from first existing item (default to 2 spaces).
  const indentMatch = /^([ \t]+)-/.exec(items);
  const indent = indentMatch ? indentMatch[1]! : "  ";
  const newItems = items + `${indent}- ${value}\n`;
  return frontmatter.slice(0, m.index) + m[1]! + newItems + frontmatter.slice(m.index + m[0].length);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isYamlSafeScalar(s: string): boolean {
  // Conservative: plain strings with no special starting chars and no colons / hashes / brackets.
  return /^[A-Za-z0-9_./@:-]+$/.test(s) && !/^[-?:>|*&!%@`]/.test(s);
}

// Replace the body between an H2 heading and the next H2 (or backlinks marker / EOF).
// Returns null if the heading isn't found. Returns the original string if the body
// is identical to the new body.
function replaceSectionBody(body: string, heading: string, newBody: string): string | null {
  const lines = body.split("\n");
  let startIdx = -1;
  let inBacklinks = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(BACKLINKS_START)) inBacklinks = true;
    if (line.includes(BACKLINKS_END)) {
      inBacklinks = false;
      continue;
    }
    if (inBacklinks) continue;
    const m = H2_RE.exec(line);
    if (m && m[1]!.trim() === heading) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  // Find end: next H2, or first backlinks marker, or EOF.
  let endIdx = lines.length;
  inBacklinks = false;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(BACKLINKS_START)) {
      endIdx = i;
      break;
    }
    if (line.includes(BACKLINKS_END)) {
      inBacklinks = false;
      continue;
    }
    if (inBacklinks) continue;
    const m = H2_RE.exec(line);
    if (m) {
      endIdx = i;
      break;
    }
  }

  // Trim trailing blank lines from new body, then sandwich a single blank line before & after.
  const trimmed = newBody.replace(/\s+$/, "").replace(/^\s+/, "");
  const next = [
    ...lines.slice(0, startIdx + 1),
    "",
    trimmed,
    "",
    ...lines.slice(endIdx),
  ].join("\n");

  // No-op if identical post-normalization.
  return next === body ? body : next;
}
