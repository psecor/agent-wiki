// Abstraction over "where do wiki files come from."
// The filesystem implementation walks a local directory tree.
// A future GitHub implementation would fetch via the GitHub API.
// Both expose the same interface so the rest of the indexer doesn't care.

export interface DiscoveredFile {
  // Identifies this file uniquely within the source.
  // For fs: absolute path. For github: "owner/repo@branch:path".
  id: string;
  // Path relative to the source root, used for index keys.
  // For fs: e.g. "rssreader/AGENTS.md". For github: e.g. "rssreader/AGENTS.md".
  relativePath: string;
  // Project or topic slug derived from the path.
  // For project files: the directory name (e.g. "rssreader").
  // For topic files: the filename without extension (e.g. "postgres-jsonb-ordering").
  slug: string;
  // What kind of doc this is.
  kind: "project-agents-md" | "topic" | "unmigrated";
  // For unmigrated entries: which legacy files were found instead.
  legacyFiles?: string[];
}

export interface Source {
  // Absolute or canonical root, used for resolving relative cross-doc links.
  rootDescription: string;

  // Discover every project AGENTS.md, every topic file, and every unmigrated project.
  discover(): Promise<DiscoveredFile[]>;

  // Read the raw content of a discovered file.
  read(file: DiscoveredFile): Promise<string>;

  // Resolve a link target (as written in markdown) from one file to another.
  // Returns the relative path of the target if it points to a known doc; null otherwise.
  resolveLink(from: DiscoveredFile, target: string): Promise<string | null>;
}
