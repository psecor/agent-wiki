// Collect git activity for a single project since its AGENTS.md last_updated date.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { GitActivity, GitCommit } from "./types.js";

export interface GatheredProject {
  name: string;
  projectDir: string;
  agentsMdPath: string;
  raw: string;
  lastUpdated: string;
  activity: GitActivity;
}

export function gatherProject(
  projectsRoot: string,
  project: string,
  sinceOverride?: string,
): GatheredProject {
  const projectDir = join(projectsRoot, project);
  const agentsMdPath = join(projectDir, "AGENTS.md");
  const raw = readFileSync(agentsMdPath, "utf8");
  const fm = matter(raw).data;
  const fmDate = typeof fm.last_updated === "string"
    ? fm.last_updated
    : fm.last_updated instanceof Date
      ? fm.last_updated.toISOString().slice(0, 10)
      : null;
  if (!fmDate && !sinceOverride) {
    throw new Error(`${agentsMdPath}: missing or unreadable last_updated frontmatter`);
  }
  const lastUpdated = sinceOverride ?? fmDate!;

  const activity = collectActivity(projectDir, lastUpdated);
  return { name: project, projectDir, agentsMdPath, raw, lastUpdated, activity };
}

function collectActivity(projectDir: string, since: string): GitActivity {
  const commits = gitCommits(projectDir, since);
  const diffstat = commits.length === 0 ? "" : gitDiffstat(projectDir, since);
  const changedFiles = commits.length === 0 ? [] : gitChangedFiles(projectDir, since);
  return { since, commits, diffstat, changedFiles };
}

function gitCommits(cwd: string, since: string): GitCommit[] {
  // Empty repo (no HEAD) → nothing to sweep.
  if (!hasCommits(cwd)) return [];
  // %x1f is the ASCII unit-separator, %x1e is record-separator. Robust against subjects with newlines/quotes.
  const FS = "\x1f";
  const RS = "\x1e";
  const out = run(
    "git",
    ["log", `--since=${since}T00:00:00`, `--pretty=format:%h${FS}%cI${FS}%an${FS}%s${RS}`, "--", "."],
    cwd,
  );
  if (!out.trim()) return [];
  return out
    .split(RS)
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [hash, date, author, subject] = rec.split(FS);
      return { hash: hash ?? "", date: date ?? "", author: author ?? "", subject: subject ?? "" };
    })
    .reverse(); // oldest-first reads more naturally in a doc-update prompt
}

function gitDiffstat(cwd: string, since: string): string {
  // Find the last commit before `since` to anchor the diff range. If no such
  // commit exists (project history is younger than since), diff against the
  // empty tree so the stat shows the entire current state.
  const beforeRef = run(
    "git",
    ["log", "-1", `--before=${since}T00:00:00`, "--pretty=format:%H", "--", "."],
    cwd,
  ).trim();
  const args = beforeRef
    ? ["diff", "--stat", `${beforeRef}..HEAD`, "--", "."]
    : ["diff", "--stat", "4b825dc642cb6eb9a060e54bf8d69288fbee4904..HEAD", "--", "."]; // git's empty tree
  return run("git", args, cwd);
}

function gitChangedFiles(cwd: string, since: string): string[] {
  const beforeRef = run(
    "git",
    ["log", "-1", `--before=${since}T00:00:00`, "--pretty=format:%H", "--", "."],
    cwd,
  ).trim();
  const args = beforeRef
    ? ["diff", "--name-only", `${beforeRef}..HEAD`, "--", "."]
    : ["ls-files"];
  const out = run("git", args, cwd);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function hasCommits(cwd: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function run(cmd: string, args: string[], cwd: string): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}: ${msg}`);
  }
}
