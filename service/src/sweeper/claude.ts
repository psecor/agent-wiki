// Thin wrapper around the Anthropic SDK for one sweeper call.

import Anthropic from "@anthropic-ai/sdk";
import type { BuiltPrompt } from "./prompt.js";
import type { SweeperResponse } from "./types.js";

const MODEL = process.env.SWEEPER_MODEL ?? "claude-opus-4-7";
// 32k is enough headroom for several rewritten sections in a complex project
// (termag's first attempt at 16k was truncated mid-Repository-Layout).
const MAX_TOKENS = 32_000;

export async function callClaude(prompt: BuiltPrompt): Promise<SweeperResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

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
