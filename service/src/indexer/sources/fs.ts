// Filesystem implementation of the Source interface.
// Walks ~/termag/projects/* looking for AGENTS.md and CLAUDE.md/README.md,
// plus agent-wiki/topics/*.md.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { DiscoveredFile, Source } from "./types.js";

export interface FsSourceOptions {
  // Root directory containing all projects (e.g. ~/termag/projects).
  projectsRoot: string;
  // Slug of the agent-wiki project itself, used to find topics/.
  agentWikiSlug?: string;
}

export class FsSource implements Source {
  readonly rootDescription: string;
  private readonly projectsRoot: string;
  private readonly agentWikiSlug: string;

  constructor(opts: FsSourceOptions) {
    this.projectsRoot = path.resolve(opts.projectsRoot);
    this.agentWikiSlug = opts.agentWikiSlug ?? "agent-wiki";
    this.rootDescription = this.projectsRoot;
  }

  async discover(): Promise<DiscoveredFile[]> {
    const out: DiscoveredFile[] = [];

    const entries = await fs.readdir(this.projectsRoot, { withFileTypes: true });
    const projectDirs = entries.filter(e => e.isDirectory() || e.isSymbolicLink());

    for (const dir of projectDirs) {
      const projectPath = path.join(this.projectsRoot, dir.name);
      const agentsMd = path.join(projectPath, "AGENTS.md");

      if (await exists(agentsMd)) {
        out.push({
          id: agentsMd,
          relativePath: `${dir.name}/AGENTS.md`,
          slug: dir.name,
          kind: "project-agents-md",
        });
      } else {
        // Track unmigrated projects so the report can show migration progress.
        const legacy: string[] = [];
        for (const candidate of ["CLAUDE.md", "README.md"]) {
          if (await exists(path.join(projectPath, candidate))) legacy.push(candidate);
        }
        if (legacy.length > 0) {
          out.push({
            id: projectPath,
            relativePath: dir.name,
            slug: dir.name,
            kind: "unmigrated",
            legacyFiles: legacy,
          });
        }
      }
    }

    // Topics live under <agentWikiSlug>/topics/*.md
    const topicsDir = path.join(this.projectsRoot, this.agentWikiSlug, "topics");
    if (await exists(topicsDir)) {
      const topicFiles = await fs.readdir(topicsDir, { withFileTypes: true });
      for (const t of topicFiles) {
        if (!t.isFile() || !t.name.endsWith(".md")) continue;
        const slug = t.name.slice(0, -3);
        const abs = path.join(topicsDir, t.name);
        out.push({
          id: abs,
          relativePath: `${this.agentWikiSlug}/topics/${t.name}`,
          slug,
          kind: "topic",
        });
      }
    }

    return out;
  }

  async read(file: DiscoveredFile): Promise<string> {
    return fs.readFile(file.id, "utf8");
  }

  async resolveLink(from: DiscoveredFile, target: string): Promise<string | null> {
    // Strip fragment and query.
    const cleanTarget = target.split("#")[0]!.split("?")[0]!;
    if (cleanTarget === "") return from.relativePath; // pure anchor, points to self
    if (/^[a-z]+:\/\//i.test(cleanTarget)) return null; // external URL
    if (cleanTarget.startsWith("mailto:")) return null;

    // Resolve relative to the *file's* directory, then re-express relative to projectsRoot.
    const fromDir = path.dirname(from.id);
    const absTarget = path.resolve(fromDir, cleanTarget);

    if (!(await exists(absTarget))) return null;

    const relToRoot = path.relative(this.projectsRoot, absTarget);
    // Anything outside projectsRoot is not addressable in our index.
    if (relToRoot.startsWith("..")) return null;
    return relToRoot;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
