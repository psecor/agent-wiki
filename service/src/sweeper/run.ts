// Per-project sweep execution. Extracted from cli.ts so both single-project
// and --all fan-out modes share the same gather → prompt → call → apply path.

import { writeFileSync } from "node:fs";
import { gatherProject } from "./gather.js";
import { buildPrompt } from "./prompt.js";
import { callClaude } from "./claude.js";
import { applyResponse } from "./apply.js";
import { printUnifiedDiff } from "./diff.js";

export interface SweepOptions {
  projectsRoot: string;
  specPath: string;
  authorAgent: string;
  dryRun: boolean;
  since: string | undefined;
  // When true, suppress per-project chatter (prompt/diff/etc.) and only
  // accumulate structured output into the report. Used by --all fan-out.
  quiet: boolean;
}

export type SweepStatus =
  | "no-commits"        // nothing happened in the project since last_updated
  | "no-changes"        // model decided nothing needed updating
  | "updated"           // sections rewritten and file saved (or would be, in dry-run)
  | "frontmatter-only"  // model returned no section updates but bumped status etc.
  | "error";            // unexpected failure; see `error`

export interface SweepReport {
  project: string;
  status: SweepStatus;
  commits: number;
  since: string;
  sectionsUpdated: string[];
  sectionsSkipped: string[];      // section names the model named but we couldn't find
  reasoning: string | null;
  error: string | null;
  agentsMdPath: string | null;
}

export async function sweepProject(project: string, opts: SweepOptions): Promise<SweepReport> {
  const report: SweepReport = {
    project,
    status: "no-changes",
    commits: 0,
    since: "",
    sectionsUpdated: [],
    sectionsSkipped: [],
    reasoning: null,
    error: null,
    agentsMdPath: null,
  };

  try {
    const gathered = gatherProject(opts.projectsRoot, project, opts.since);
    report.since = gathered.lastUpdated;
    report.commits = gathered.activity.commits.length;
    report.agentsMdPath = gathered.agentsMdPath;

    if (gathered.activity.commits.length === 0) {
      report.status = "no-commits";
      if (!opts.quiet) {
        process.stdout.write(`No commits in ${project} since ${gathered.lastUpdated}. Nothing to sweep.\n`);
      }
      return report;
    }

    if (!opts.quiet) {
      process.stdout.write(
        `Sweeping ${project}: ${gathered.activity.commits.length} commit(s) since ${gathered.lastUpdated}.\n`,
      );
    }

    const prompt = buildPrompt(opts.specPath, gathered);
    if (!opts.quiet) process.stdout.write("Calling Claude…\n");
    const response = await callClaude(prompt);
    report.reasoning = response.reasoning;

    if (!opts.quiet) process.stdout.write(`Claude said: ${response.reasoning}\n\n`);

    if (response.no_changes_needed && response.updates.length === 0) {
      report.status = "no-changes";
      if (!opts.quiet) process.stdout.write("Model reports no changes needed.\n");
      return report;
    }

    const today = new Date().toISOString().slice(0, 10);
    const result = applyResponse(gathered.raw, response, opts.authorAgent, today);
    report.sectionsUpdated = result.applied;
    report.sectionsSkipped = result.skipped;

    if (result.skipped.length > 0 && !opts.quiet) {
      process.stderr.write(
        `WARNING: ${result.skipped.length} update(s) skipped (heading not found): ${result.skipped.join(", ")}\n`,
      );
    }

    if (result.applied.length === 0 && result.next === gathered.raw) {
      report.status = "no-changes";
      if (!opts.quiet) process.stdout.write("No effective changes after apply.\n");
      return report;
    }

    report.status = result.applied.length === 0 ? "frontmatter-only" : "updated";

    if (!opts.quiet) {
      process.stdout.write(
        `Sections updated: ${result.applied.length === 0 ? "(frontmatter only)" : result.applied.join(", ")}\n\n`,
      );
      printUnifiedDiff(`${project}/AGENTS.md`, gathered.raw, result.next);
    }

    if (opts.dryRun) {
      if (!opts.quiet) process.stdout.write("\n[--dry-run] not writing.\n");
      return report;
    }

    writeFileSync(gathered.agentsMdPath, result.next);
    if (!opts.quiet) {
      process.stdout.write(`\nWrote ${gathered.agentsMdPath}.\n`);
      process.stdout.write("Re-run the indexer to refresh the wiki UI.\n");
    }
    return report;
  } catch (err) {
    report.status = "error";
    report.error = err instanceof Error ? err.message : String(err);
    return report;
  }
}
