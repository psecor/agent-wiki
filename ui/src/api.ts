// Thin client for the agent-wiki JSON API. All paths are relative to
// PATH_PREFIX — the server mounts everything under /wiki, and the
// router/Vite base mirror that, so we just say "/api/..." here.

const API = "/wiki/api";
const AUTH = "/wiki/auth";

export interface Frontmatter {
  project: string;
  status: "production" | "in-progress" | "experimental" | "archived";
  status_description: string;
  last_updated: string;
  last_updated_by: string[];
  wiki_schema_version: number;
  topic?: string;
  applies_to?: string[];
}

export interface ProjectIndexEntry {
  name: string;
  path: string;
  agentsMdPath: string;
  relativePath: string;
  frontmatter: Frontmatter | null;
  sections: Array<{ name: string; slug: string; charCount: number }>;
  linksOut: Array<{ label: string; target: string; fromSection: string | null }>;
}

export interface UnmigratedEntry {
  name: string;
  path: string;
  has: string[];
}

export interface ProjectsIndex {
  schema_version: 1;
  generated_at: string;
  projects: ProjectIndexEntry[];
  unmigrated: UnmigratedEntry[];
}

export interface TopicIndexEntry {
  slug: string;
  relativePath: string;
  absolutePath: string;
  frontmatter: Frontmatter | null;
  sections: Array<{ name: string; slug: string; charCount: number }>;
  linksOut: Array<{ label: string; target: string; fromSection: string | null }>;
}

export interface TopicsIndex {
  schema_version: 1;
  generated_at: string;
  topics: TopicIndexEntry[];
}

export interface BacklinkEntry {
  from: string;
  fromSection: string | null;
  label: string;
}

export interface SearchEntry {
  id: string;
  doc: string;
  docKind: "project" | "topic";
  project?: string;
  topic?: string;
  section: string;
  body: string;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  file: string;
  kind: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ValidationReport {
  schema_version: 1;
  generated_at: string;
  issues: ValidationIssue[];
  summary: {
    total: number;
    bySeverity: Record<"error" | "warning" | "info", number>;
    byFile: Record<string, number>;
  };
}

export interface SessionUser {
  email: string;
  name: string;
  picture?: string;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new HttpError(r.status, `${r.status} ${r.statusText}: ${text}`);
  }
  return (await r.json()) as T;
}

export const isUnauthenticated = (e: unknown): boolean =>
  e instanceof HttpError && e.status === 401;

export const api = {
  me: () => getJson<{ user: SessionUser | null }>(`${API}/auth/me`),
  projects: () => getJson<ProjectsIndex>(`${API}/projects`),
  project: (name: string) =>
    getJson<{
      project: ProjectIndexEntry;
      raw: string | null;
      backlinks: BacklinkEntry[];
    }>(`${API}/projects/${encodeURIComponent(name)}`),
  topics: () => getJson<TopicsIndex>(`${API}/topics`),
  topic: (slug: string) =>
    getJson<{
      topic: TopicIndexEntry;
      raw: string | null;
      backlinks: BacklinkEntry[];
    }>(`${API}/topics/${encodeURIComponent(slug)}`),
  search: (q: string) =>
    getJson<{ query: string; results: SearchEntry[]; truncated?: boolean }>(
      `${API}/search?q=${encodeURIComponent(q)}`,
    ),
  validation: () => getJson<ValidationReport>(`${API}/validation`),
  logout: () =>
    fetch(`${AUTH}/logout`, { method: "POST", credentials: "include" }),
};

export const loginUrl = `${AUTH}/google`;
