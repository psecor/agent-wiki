// Sweeper-specific types. Lives alongside the indexer types but kept separate
// because the sweeper is a write-path tool with its own data shapes.

export interface GitActivity {
  // ISO date the activity is computed since (the AGENTS.md frontmatter last_updated).
  since: string;
  // Commit list, oldest-first. Empty array means "nothing to sweep."
  commits: GitCommit[];
  // `git diff --stat` between then and HEAD, as a single block of text.
  diffstat: string;
  // For commits that touched specific files, the list of changed paths
  // (deduped, project-relative). Useful to give Claude a sense of what moved.
  changedFiles: string[];
}

export interface GitCommit {
  hash: string;        // short hash
  date: string;        // ISO date
  subject: string;
  author: string;
}

// What we ask Claude to return. JSON in a fenced code block.
export interface SweeperResponse {
  // Free-form note from the model — shown to the user, not stored.
  reasoning: string;
  // Whether any sections need updating. If false, `updates` should be [].
  no_changes_needed: boolean;
  // Section-body replacements. Heading text is fixed; we only replace the body
  // between two H2s. The model is instructed never to invent new H2s.
  updates: SectionUpdate[];
  // Optional one-sentence update to status_description in frontmatter.
  // null means leave unchanged.
  new_status_description: string | null;
  // Optional new value for the status enum. null means leave unchanged.
  new_status: "production" | "in-progress" | "experimental" | "archived" | null;
}

export interface SectionUpdate {
  // Must match an existing canonical H2 in the file exactly.
  section: string;
  // The new body markdown. We replace everything between this H2 and the next.
  body: string;
}

export interface SweeperPlan {
  project: string;
  agentsMdPath: string;
  before: string;        // raw AGENTS.md before the sweep
  activity: GitActivity;
  response: SweeperResponse;
  after: string;         // raw AGENTS.md after applying the response (in-memory)
}
