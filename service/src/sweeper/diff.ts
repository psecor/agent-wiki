// Print a colored unified diff between two strings using `git diff --no-index`.
// We shell out instead of bundling a JS diff library because (a) git's diff is
// already great, (b) zero extra deps, and (c) the user is reading the output in
// a terminal that already understands git's color codes.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function printUnifiedDiff(label: string, before: string, after: string): void {
  if (before === after) {
    process.stdout.write(`(no textual change in ${label})\n`);
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "agent-wiki-diff-"));
  try {
    const a = join(dir, "before.md");
    const b = join(dir, "after.md");
    writeFileSync(a, before);
    writeFileSync(b, after);
    const res = spawnSync(
      "git",
      ["--no-pager", "diff", "--no-index", "--color=always", "--no-prefix", a, b],
      { encoding: "utf8" },
    );
    // git diff --no-index exits 1 when files differ, which is the expected case.
    process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
