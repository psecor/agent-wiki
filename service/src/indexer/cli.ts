// CLI entry point. No commander dep — argv is shallow enough to parse by hand.
//
// Usage:
//   indexer build [--projects-root <path>] [--out <path>]
//   indexer validate [--projects-root <path>]
//
// Defaults: projects-root = ~/termag/projects, out = <agent-wiki>/index

import path from "node:path";
import os from "node:os";
import { build } from "./build.js";
import { FsSource } from "./sources/fs.js";
import { writeBacklinks } from "./write_backlinks.js";

const DEFAULT_PROJECTS_ROOT = path.join(os.homedir(), "termag", "projects");
const DEFAULT_AGENT_WIKI = path.join(DEFAULT_PROJECTS_ROOT, "agent-wiki");
const DEFAULT_OUT = path.join(DEFAULT_AGENT_WIKI, "index");

interface Args {
  command: "build" | "validate" | "help";
  projectsRoot: string;
  out: string;
  writeBacklinks: boolean;
}

function parseArgs(argv: string[]): Args {
  const command = (argv[0] ?? "build") as Args["command"];
  let projectsRoot = DEFAULT_PROJECTS_ROOT;
  let out = DEFAULT_OUT;
  let writeBacklinksFlag = true;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--projects-root" && next) {
      projectsRoot = path.resolve(next);
      i++;
    } else if (arg === "--out" && next) {
      out = path.resolve(next);
      i++;
    } else if (arg === "--no-backlinks") {
      writeBacklinksFlag = false;
    } else if (arg === "--help" || arg === "-h") {
      return { command: "help", projectsRoot, out, writeBacklinks: writeBacklinksFlag };
    }
  }
  if (!["build", "validate", "help"].includes(command)) {
    return { command: "help", projectsRoot, out, writeBacklinks: writeBacklinksFlag };
  }
  return { command, projectsRoot, out, writeBacklinks: writeBacklinksFlag };
}

function printHelp(): void {
  console.log(`agent-wiki indexer

Usage:
  indexer build     [--projects-root <path>] [--out <path>] [--no-backlinks]
  indexer validate  [--projects-root <path>]

Defaults:
  --projects-root  ${DEFAULT_PROJECTS_ROOT}
  --out            ${DEFAULT_OUT}

build           Discover, parse, write index/*.json, and refresh backlinks
                blocks inside each project's AGENTS.md.
  --no-backlinks  Skip the backlinks writeback step.
validate        Run validation only; print issues; exit non-zero on errors.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    printHelp();
    return;
  }

  const source = new FsSource({ projectsRoot: args.projectsRoot });
  const result = await build({ source, outDir: args.out });

  const { summary } = result.validation;
  const { projects, unmigrated } = result.projects;

  if (args.command === "validate") {
    for (const issue of result.validation.issues) {
      const sev = issue.severity.toUpperCase().padEnd(7);
      console.log(`${sev} ${issue.file}: [${issue.kind}] ${issue.message}`);
    }
    console.log(`\n${summary.total} issues  (${summary.bySeverity.error} errors, ${summary.bySeverity.warning} warnings, ${summary.bySeverity.info} info)`);
    if (summary.bySeverity.error > 0) process.exit(1);
    return;
  }

  // build (default)
  console.log(`Indexed ${projects.length} project(s), ${result.topics.topics.length} topic(s).`);
  console.log(`Unmigrated: ${unmigrated.length} (${unmigrated.map(u => u.name).join(", ") || "none"})`);
  console.log(`Validation: ${summary.total} issues (${summary.bySeverity.error} errors, ${summary.bySeverity.warning} warnings).`);
  console.log(`Wrote: ${args.out}/{projects,topics,backlinks,search,validation}.json`);

  if (args.writeBacklinks) {
    const wb = await writeBacklinks(projects, result.backlinks.backlinks);
    const parts = [
      `${wb.updated.length} updated`,
      `${wb.unchanged.length} unchanged`,
    ];
    if (wb.skipped.length > 0) parts.push(`${wb.skipped.length} skipped`);
    console.log(`Backlinks: ${parts.join(", ")}.`);
    if (wb.skipped.length > 0) {
      for (const f of wb.skipped) console.log(`  skipped (no markers): ${f}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
