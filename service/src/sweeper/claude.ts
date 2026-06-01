// Drives one sweeper call against Claude. Supports two auth paths:
//
//   1. CLI (default when ANTHROPIC_API_KEY is unset): spawn `claude -p` and
//      reuse the user's existing Claude Code session. No API key needed; cost
//      is billed against whatever account the local Claude Code is logged
//      into. Best for personal/laptop installs.
//   2. SDK (used when ANTHROPIC_API_KEY is set): the original direct
//      Anthropic SDK path. Best for server/headless installs where the
//      service has its own API key.

import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";
import type { BuiltPrompt } from "./prompt.js";
import type { SweeperResponse } from "./types.js";

const MODEL = process.env.SWEEPER_MODEL ?? "claude-opus-4-7";
// 32k is enough headroom for several rewritten sections in a complex project
// (termag's first attempt at 16k was truncated mid-Repository-Layout).
const MAX_TOKENS = 32_000;

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
// Belt-and-suspenders cost cap for the CLI path. Sweeps that exceed this
// abort instead of running unboundedly long against a misconfigured prompt.
const CLI_MAX_BUDGET_USD = process.env.SWEEPER_MAX_BUDGET_USD ?? "2.00";

export async function callClaude(prompt: BuiltPrompt): Promise<SweeperResponse> {
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaudeViaSdk(prompt);
  }
  return callClaudeViaCli(prompt);
}

async function callClaudeViaSdk(prompt: BuiltPrompt): Promise<SweeperResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const client = new Anthropic({ apiKey });
  // Streaming is required by the SDK at this max_tokens setting (the non-stream
  // path throws a "Streaming is strongly recommended" guard above ~21k tokens).
  // We don't need incremental output for our use case — just await the final
  // message at the end.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "max_tokens") {
    throw new Error(
      `Claude hit max_tokens (${MAX_TOKENS}); response is truncated and unparseable. ` +
      `Bump MAX_TOKENS in claude.ts or split the project into a smaller sweep.`,
    );
  }

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return parseResponse(text);
}

async function callClaudeViaCli(prompt: BuiltPrompt): Promise<SweeperResponse> {
  // Defensive flags:
  //   --setting-sources ''       skip user/project/local settings → don't load
  //                              hooks (avoids the Stop-hook re-firing on the
  //                              very sweep that spawned us).
  //   --tools ''                 sweeper just needs text generation, no tools.
  //   --no-session-persistence   keep sweep runs out of /resume history.
  //   --max-budget-usd ...       cap runaway cost.
  // We also set cwd to a tmp dir outside PROJECTS_ROOT as a second guard
  // against the Stop hook (which keys on cwd) re-triggering.
  const args = [
    "-p",
    "--output-format", "json",
    "--model", MODEL,
    "--system-prompt", prompt.system,
    "--setting-sources", "",
    "--tools", "",
    "--no-session-persistence",
    "--max-budget-usd", CLI_MAX_BUDGET_USD,
  ];

  const child = spawn(CLAUDE_BIN, args, {
    cwd: tmpdir(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.write(prompt.user);
  child.stdin.end();

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (d: string) => { stdout += d; });
  child.stderr.on("data", (d: string) => { stderr += d; });

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });

  if (exitCode !== 0) {
    throw new Error(
      `claude CLI exited ${exitCode}. ` +
      `stderr: ${stderr.slice(0, 2000)} ` +
      `stdout: ${stdout.slice(0, 500)}`,
    );
  }

  interface CliResult {
    result?: string;
    is_error?: boolean;
    api_error_status?: string | null;
    stop_reason?: string;
    total_cost_usd?: number;
  }
  let parsed: CliResult;
  try {
    parsed = JSON.parse(stdout) as CliResult;
  } catch (err) {
    throw new Error(
      `claude CLI JSON output unparseable: ${err instanceof Error ? err.message : String(err)}\n` +
      `Raw stdout (first 1000 chars):\n${stdout.slice(0, 1000)}`,
    );
  }

  if (parsed.is_error) {
    throw new Error(`claude CLI reported error: ${parsed.api_error_status ?? "unknown"}`);
  }
  if (parsed.stop_reason && parsed.stop_reason !== "end_turn") {
    throw new Error(
      `claude CLI stopped with stop_reason=${parsed.stop_reason} ` +
      `(response may be truncated). Re-run with --plan to inspect the prompt.`,
    );
  }

  const text = parsed.result ?? "";
  if (!text) throw new Error("claude CLI returned an empty result string");
  return parseResponse(text);
}

function parseResponse(text: string): SweeperResponse {
  // The system prompt asks for a raw JSON object (no fence). Bodies often contain
  // their own ```code fences```, so a fenced wrapper around the JSON would
  // confuse any regex-based extractor — string-aware brace counting is safer.
  const candidate = extractFirstObject(text);
  if (!candidate) {
    throw new Error(`Claude response did not contain a balanced JSON object. Raw text:\n${text}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `Claude response JSON did not parse: ${err instanceof Error ? err.message : String(err)}\nRaw:\n${candidate}`,
    );
  }
  return normalize(parsed);
}

// String-aware brace counter. Skips `{` and `}` that appear inside JSON string
// literals (handling `\\` and `\"` escapes correctly), so a body field
// containing literal braces or code fences doesn't cause early termination.
function extractFirstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function normalize(raw: unknown): SweeperResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("Claude response is not an object");
  }
  const r = raw as Record<string, unknown>;
  const updates = Array.isArray(r.updates) ? r.updates : [];
  return {
    reasoning: typeof r.reasoning === "string" ? r.reasoning : "",
    no_changes_needed: r.no_changes_needed === true,
    updates: updates
      .filter((u): u is Record<string, unknown> => !!u && typeof u === "object")
      .map((u) => ({
        section: String(u.section ?? "").trim(),
        body: typeof u.body === "string" ? u.body : "",
      }))
      .filter((u) => u.section.length > 0),
    new_status_description:
      typeof r.new_status_description === "string" && r.new_status_description.trim().length > 0
        ? r.new_status_description.trim()
        : null,
    new_status:
      r.new_status === "production" ||
      r.new_status === "in-progress" ||
      r.new_status === "experimental" ||
      r.new_status === "archived"
        ? r.new_status
        : null,
  };
}
