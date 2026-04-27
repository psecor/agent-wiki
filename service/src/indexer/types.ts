// Shared types for the indexer.

export const CANONICAL_SECTIONS = [
  "What This Is",
  "Status",
  "Domain Model",
  "Repository Layout",
  "Architecture",
  "Data & Schema",
  "Configuration",
  "Build, Run, Deploy",
  "Observability & Maintenance",
  "Integration Surfaces",
  "Gotchas",
  "Related",
] as const;

export type CanonicalSection = (typeof CANONICAL_SECTIONS)[number];

export const STATUS_VALUES = ["production", "in-progress", "experimental", "archived"] as const;
export type Status = (typeof STATUS_VALUES)[number];

export interface Frontmatter {
  project: string;
  status: Status;
  status_description: string;
  last_updated: string;
  last_updated_by: string[];
  wiki_schema_version: number;
  // topics use a slightly different shape — see TopicFrontmatter
  topic?: string;
  applies_to?: string[];
}

export interface ParsedSection {
  heading: string;       // e.g. "Gotchas"
  level: number;         // 2 for canonical sections
  startLine: number;     // 1-indexed
  endLine: number;       // 1-indexed (inclusive)
  body: string;          // text between this heading and the next H2
}

export interface ParsedLink {
  label: string;
  target: string;        // raw href as written in the markdown
  fromSection: string | null;
}

export interface ParsedDocument {
  relativePath: string;   // e.g. "rssreader/AGENTS.md"
  absolutePath: string;
  raw: string;
  frontmatter: Frontmatter | null;
  frontmatterError: string | null;
  sections: ParsedSection[];
  links: ParsedLink[];
}

export interface ProjectIndexEntry {
  name: string;
  path: string;                  // absolute path to the project dir
  agentsMdPath: string;          // absolute path to AGENTS.md
  relativePath: string;          // <project>/AGENTS.md
  frontmatter: Frontmatter | null;
  sections: Array<{ name: string; slug: string; charCount: number }>;
  linksOut: ParsedLink[];
}

export interface UnmigratedEntry {
  name: string;
  path: string;
  has: string[];                 // e.g. ["CLAUDE.md", "README.md"]
}

export interface ProjectsIndex {
  schema_version: 1;
  generated_at: string;          // ISO timestamp
  projects: ProjectIndexEntry[];
  unmigrated: UnmigratedEntry[];
}

export interface TopicIndexEntry {
  slug: string;                  // e.g. "postgres-jsonb-ordering"
  relativePath: string;          // topics/<slug>.md
  absolutePath: string;
  frontmatter: Frontmatter | null;
  sections: Array<{ name: string; slug: string; charCount: number }>;
  linksOut: ParsedLink[];
}

export interface TopicsIndex {
  schema_version: 1;
  generated_at: string;
  topics: TopicIndexEntry[];
}

export interface BacklinkEntry {
  from: string;                  // relative path of the linking doc
  fromSection: string | null;
  label: string;
}

export interface BacklinksIndex {
  schema_version: 1;
  generated_at: string;
  // map of doc relative path → array of backlinks
  backlinks: Record<string, BacklinkEntry[]>;
}

export interface SearchEntry {
  id: string;                    // <relativePath>#<sectionSlug>
  doc: string;                   // relative path
  docKind: "project" | "topic";
  project?: string;              // for project docs
  topic?: string;                // for topic docs
  section: string;               // canonical section name
  body: string;                  // section body text (markdown stripped lightly)
}

export interface SearchIndex {
  schema_version: 1;
  generated_at: string;
  entries: SearchEntry[];
}

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  file: string;                  // relative path
  kind: string;                  // e.g. "broken_link", "missing_required_field"
  message: string;
  context?: Record<string, unknown>;
}

export interface ValidationReport {
  schema_version: 1;
  generated_at: string;
  issues: ValidationIssue[];
  summary: {
    total: number;
    bySeverity: Record<ValidationSeverity, number>;
    byFile: Record<string, number>;
  };
}
