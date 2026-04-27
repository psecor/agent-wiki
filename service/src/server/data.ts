// Data access for the server. Reads the indexer's JSON output and individual
// AGENTS.md / topic files from disk on demand.
//
// No in-memory cache for v1 — the index is small and reads are cheap. Add caching
// later if it shows up in profiles.

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  BacklinksIndex,
  ProjectsIndex,
  SearchIndex,
  TopicsIndex,
  ValidationReport,
} from "../indexer/types.js";

export interface DataLayer {
  projects(): Promise<ProjectsIndex>;
  topics(): Promise<TopicsIndex>;
  backlinks(): Promise<BacklinksIndex>;
  search(): Promise<SearchIndex>;
  validation(): Promise<ValidationReport>;
  // Raw markdown body of a project's AGENTS.md or a topic file.
  // Returns null if the doc isn't in the projects/topics index (prevents
  // path-traversal — only known docs are readable).
  rawDoc(relativePath: string): Promise<string | null>;
}

export interface DataLayerOptions {
  indexDir: string;
  projectsRoot: string;
}

export function createDataLayer(opts: DataLayerOptions): DataLayer {
  const readJson = async <T>(name: string): Promise<T> => {
    const p = path.join(opts.indexDir, name);
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  };

  return {
    projects: () => readJson<ProjectsIndex>("projects.json"),
    topics: () => readJson<TopicsIndex>("topics.json"),
    backlinks: () => readJson<BacklinksIndex>("backlinks.json"),
    search: () => readJson<SearchIndex>("search.json"),
    validation: () => readJson<ValidationReport>("validation.json"),
    async rawDoc(relativePath: string): Promise<string | null> {
      // Only allow paths that appear in the projects or topics index — this
      // both prevents path-traversal and ensures we never serve random files.
      const [projects, topics] = await Promise.all([
        this.projects(),
        this.topics(),
      ]);
      const known = new Set<string>([
        ...projects.projects.map(p => p.relativePath),
        ...topics.topics.map(t => t.relativePath),
      ]);
      if (!known.has(relativePath)) return null;
      const abs = path.join(opts.projectsRoot, relativePath);
      try {
        return await fs.readFile(abs, "utf8");
      } catch {
        return null;
      }
    },
  };
}
