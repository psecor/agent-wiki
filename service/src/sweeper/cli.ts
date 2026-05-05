// Sweeper CLI: refresh AGENTS.md against recent git activity.
//
// Usage:
//   npm run sweeper -- <project>            # call Claude, apply, write file, print diff
//   npm run sweeper -- <project> --dry-run  # call Claude, print diff, don't write
//   npm run sweeper -- <project> --plan     # print prompt + skip Claude (debug)
//   npm run sweeper -- --all                # iterate every project under PROJECTS_ROOT
//   npm run sweeper -- --all --dry-run      # fan-out without writing
//   npm run sweeper -- --all --verbose      # fan-out with full per-project output

import "dotenv/config";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gatherProject } from "./gather.js";
import { buildPrompt } from "./prompt.js";
import { sweepProject, type SweepReport, type SweepOptions } from "./run.js";

// Built file lives at service/dist/sweeper/cli.js, so three levels up is
// the agent-wiki repo root. (ESM has no __dirname.)
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

const SPEC_PATH =
  process.env.AGENT_WIKI_SPEC_PATH ??
  resolve(REPO_ROOT, "spec/schema.md");

// PROJECTS_ROOT has no sensible default — it's the parent dir containing
// the sibling projects this sweeper maintains. Required at install time.
const PROJECTS_ROOT = (() => {
  const v = process.env.AGENT_WIKI_PROJECTS_ROOT ?? process.env.PROJECTS_ROOT;
  if (!v) {
    throw new Error(
      "AGENT_WIKI_PROJECTS_ROOT (or PROJECTS_ROOT) must be set — " +
      "point it at the parent dir of the projects you want to sweep.",
    );
  }
  return resolve(v);
})();
const AUTHOR_AGENT = process.env.SWEEPER_AGENT ?? "agent:sweeper-claude-opus-4-7";

interface CliArgs {
  project: string | null;   // null when --all
  all: boolean;
  dryRun: boolean;
  planOnly: boolean;
  verbose: boolean;
  since: string | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = argv.filter((a) => a.startsWith("--"));
  const all = flags.includes("--all");
  if (positional.length === 0 && !all) {
    throw new Error(
      "usage: sweeper <project> [--dry-run] [--plan] [--since=YYYY-MM-DD]\n" +
      "       sweeper --all [--dry-run] [--verbose] [--since=YYYY-MM-DD]",
    );
  }
  const sinceFlag = flags.find((f) => f.startsWith("--since="));
  return {
    project: all ? null : positional[0]!,
    all,
    dryRun: flags.includes("--dry-run"),
    planOnly: flags.includes("--plan"),
    verbose: flags.includes("--verbose"),
    since: sinceFlag ? sinceFlag.slice("--since=".length) : undefined,
  };
}

function listProjects(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => e.name)
    .filter((name) => {
      const agentsMd = join(root, name, "AGENTS.md");
      try { return statSync(agentsMd).isFile(); } catch { return false; }
    })
    .sort();
}

function statusGlyph(status: SweepReport["status"]): string {
  switch (status) {
    case "updated":          return "✓";
    case "frontmatter-only": return "✓";
    case "no-changes":       return "·";
    case "no-commits":       return "·";
    case "error":            return "✗";
  }
}

function statusLine(report: SweepReport): string {
  const glyph = statusGlyph(report.status);
  const head = `${glyph} ${report.project.padEnd(36)}`;
  switch (report.status) {
    case "no-commits":
      return `${head} no commits since ${report.since}`;
    case "no-changes":
      return `${head} no changes (${report.commits} commit${report.commits === 1 ? "" : "s"})`;
    case "frontmatter-only":
      return `${head} frontmatter-only (${report.commits} commits)`;
    case "updated":
      return `${head} updated: ${report.sectionsUpdated.join(", ")}`;
    case "error":
      return `${head} ERROR: ${report.error}`;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const baseOpts: Omit<SweepOptions, "quiet"> = {
    projectsRoot: PROJECTS_ROOT,
    specPath: SPEC_PATH,
    authorAgent: AUTHOR_AGENT,
    dryRun: args.dryRun,
    since: args.since,
  };

  // --plan is a single-project debug aid; bypass the normal flow.
  if (args.planOnly) {
    if (!args.project) throw new Error("--plan requires a project name");
    const project = gatherProject(PROJECTS_ROOT, args.project, args.since);
    const prompt = buildPrompt(SPEC_PATH, project);
    process.stdout.write("=== SYSTEM ===\n");
    process.stdout.write(prompt.system + "\n");
    process.stdout.write("=== USER ===\n");
    process.stdout.write(prompt.user + "\n");
    return;
  }

  if (!args.all) {
    // Single-project mode: full verbose output, behaves like the old cli.ts.
    const report = await sweepProject(args.project!, { ...baseOpts, quiet: false });
    if (report.status === "error") process.exit(1);
    return;
  }

  // Fan-out mode.
  const projects = listProjects(PROJECTS_ROOT);
  if (projects.length === 0) {
    process.stdout.write(`No projects with AGENTS.md found under ${PROJECTS_ROOT}.\n`);
    return;
  }

  process.stdout.write(`Sweeping ${projects.length} project(s) under ${PROJECTS_ROOT}.\n`);
  if (args.dryRun) process.stdout.write("(--dry-run: no files will be written.)\n");
  process.stdout.write("\n");

  const reports: SweepReport[] = [];
  for (const project of projects) {
    if (args.verbose) {
      process.stdout.write(`────── ${project} ──────\n`);
    }
    const report = await sweepProject(project, { ...baseOpts, quiet: !args.verbose });
    reports.push(report);
    if (!args.verbose) process.stdout.write(statusLine(report) + "\n");
  }

  // Summary.
  const counts = {
    updated: 0,
    frontmatterOnly: 0,
    noChanges: 0,
    noCommits: 0,
    error: 0,
  };
  for (const r of reports) {
    if (r.status === "updated") counts.updated++;
    else if (r.status === "frontmatter-only") counts.frontmatterOnly++;
    else if (r.status === "no-changes") counts.noChanges++;
    else if (r.status === "no-commits") counts.noCommits++;
    else if (r.status === "error") counts.error++;
  }

  process.stdout.write("\n");
  process.stdout.write(
    `Done. ${counts.updated} updated, ${counts.frontmatterOnly} frontmatter-only, ` +
    `${counts.noChanges} no-change, ${counts.noCommits} no-commits, ${counts.error} error.\n`,
  );
  if (counts.updated > 0 || counts.frontmatterOnly > 0) {
    process.stdout.write(args.dryRun
      ? "Re-run without --dry-run to apply.\n"
      : "Re-run the indexer to refresh the wiki UI.\n");
  }
  if (counts.error > 0) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`sweeper: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
