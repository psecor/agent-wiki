// Spec-compliance checks. Collects issues; never throws.

import {
  CANONICAL_SECTIONS,
  STATUS_VALUES,
  type ParsedDocument,
  type ValidationIssue,
} from "./types.js";

const REQUIRED_FIELDS = [
  "project",
  "status",
  "status_description",
  "last_updated",
  "last_updated_by",
  "wiki_schema_version",
] as const;

const TOPIC_REQUIRED_FIELDS = [
  "topic",
  "last_updated",
  "last_updated_by",
  "wiki_schema_version",
] as const;

const AUTHOR_PREFIX_RE = /^(agent|human):.+/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateProjectDoc(
  doc: ParsedDocument,
  resolvedLinks: Map<string, string | null>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const file = doc.relativePath;

  // Frontmatter.
  if (!doc.frontmatter) {
    issues.push({
      severity: "error",
      file,
      kind: "frontmatter_missing",
      message: doc.frontmatterError ?? "no frontmatter found",
    });
  } else {
    const fm = doc.frontmatter as unknown as Record<string, unknown>;
    for (const field of REQUIRED_FIELDS) {
      if (fm[field] === undefined || fm[field] === null || fm[field] === "") {
        issues.push({
          severity: "error",
          file,
          kind: "missing_required_field",
          message: `frontmatter is missing required field "${field}"`,
        });
      }
    }
    if (typeof fm.status === "string" && !STATUS_VALUES.includes(fm.status as never)) {
      issues.push({
        severity: "error",
        file,
        kind: "invalid_status",
        message: `status "${fm.status}" not in ${JSON.stringify(STATUS_VALUES)}`,
      });
    }
    if (typeof fm.last_updated === "string" && !ISO_DATE_RE.test(fm.last_updated)) {
      issues.push({
        severity: "warning",
        file,
        kind: "bad_date_format",
        message: `last_updated "${fm.last_updated}" should be YYYY-MM-DD`,
      });
    }
    if (Array.isArray(fm.last_updated_by)) {
      for (const entry of fm.last_updated_by as unknown[]) {
        if (typeof entry !== "string" || !AUTHOR_PREFIX_RE.test(entry)) {
          issues.push({
            severity: "warning",
            file,
            kind: "bad_author_prefix",
            message: `last_updated_by entry "${String(entry)}" should be "agent:<id>" or "human:<handle>"`,
          });
        }
      }
    } else if (fm.last_updated_by !== undefined) {
      issues.push({
        severity: "error",
        file,
        kind: "last_updated_by_not_list",
        message: "last_updated_by must be a YAML list, not a single string",
      });
    }
  }

  // Sections — must be from canonical list, in canonical order, no duplicates.
  const canonicalIndex = new Map<string, number>();
  CANONICAL_SECTIONS.forEach((s, i) => canonicalIndex.set(s, i));

  let lastIdx = -1;
  const seen = new Set<string>();
  for (const section of doc.sections) {
    const idx = canonicalIndex.get(section.heading);
    if (idx === undefined) {
      issues.push({
        severity: "warning",
        file,
        kind: "non_canonical_section",
        message: `H2 "${section.heading}" is not in the canonical section list`,
        context: { line: section.startLine },
      });
      continue;
    }
    if (seen.has(section.heading)) {
      issues.push({
        severity: "error",
        file,
        kind: "duplicate_section",
        message: `H2 "${section.heading}" appears more than once`,
        context: { line: section.startLine },
      });
    }
    seen.add(section.heading);
    if (idx < lastIdx) {
      issues.push({
        severity: "warning",
        file,
        kind: "out_of_order_section",
        message: `H2 "${section.heading}" appears after a later canonical section`,
        context: { line: section.startLine },
      });
    }
    lastIdx = Math.max(lastIdx, idx);
  }

  // Required sections present?
  for (const required of ["What This Is", "Status"] as const) {
    if (!seen.has(required)) {
      issues.push({
        severity: "error",
        file,
        kind: "missing_required_section",
        message: `required section "${required}" is missing`,
      });
    }
  }

  // Backlinks markers present?
  if (!doc.raw.includes("<!-- agent-wiki:backlinks-start -->")) {
    issues.push({
      severity: "warning",
      file,
      kind: "missing_backlinks_marker",
      message: "agent-wiki:backlinks-start marker not found",
    });
  }

  // Cross-doc link targets.
  for (const link of doc.links) {
    const resolved = resolvedLinks.get(link.target);
    if (resolved === null) {
      issues.push({
        severity: "warning",
        file,
        kind: "broken_link",
        message: `link target "${link.target}" does not resolve`,
        context: { label: link.label, fromSection: link.fromSection },
      });
    }
  }

  return issues;
}

export function validateTopicDoc(
  doc: ParsedDocument,
  resolvedLinks: Map<string, string | null>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const file = doc.relativePath;

  if (!doc.frontmatter) {
    issues.push({
      severity: "error",
      file,
      kind: "frontmatter_missing",
      message: doc.frontmatterError ?? "no frontmatter found",
    });
  } else {
    const fm = doc.frontmatter as unknown as Record<string, unknown>;
    for (const field of TOPIC_REQUIRED_FIELDS) {
      if (fm[field] === undefined || fm[field] === null || fm[field] === "") {
        issues.push({
          severity: "error",
          file,
          kind: "missing_required_field",
          message: `topic frontmatter is missing required field "${field}"`,
        });
      }
    }
  }

  for (const link of doc.links) {
    const resolved = resolvedLinks.get(link.target);
    if (resolved === null) {
      issues.push({
        severity: "warning",
        file,
        kind: "broken_link",
        message: `link target "${link.target}" does not resolve`,
        context: { label: link.label, fromSection: link.fromSection },
      });
    }
  }

  return issues;
}

export function summarize(issues: ValidationIssue[]): {
  total: number;
  bySeverity: Record<"error" | "warning" | "info", number>;
  byFile: Record<string, number>;
} {
  const bySeverity = { error: 0, warning: 0, info: 0 };
  const byFile: Record<string, number> = {};
  for (const i of issues) {
    bySeverity[i.severity]++;
    byFile[i.file] = (byFile[i.file] ?? 0) + 1;
  }
  return { total: issues.length, bySeverity, byFile };
}
