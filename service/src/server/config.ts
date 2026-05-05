// Environment-driven server config. Fail fast on missing required values.

import "dotenv/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required in environment`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

// Built file lives at service/dist/server/config.js, so three levels up is
// the agent-wiki repo root. (ESM has no __dirname.)
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

export const config = {
  port: Number(optional("PORT", "3045")),
  baseUrl: required("BASE_URL"),
  pathPrefix: optional("PATH_PREFIX", "/wiki"),
  sessionSecret: required("SESSION_SECRET"),
  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
  allowedEmails: required("ALLOWED_EMAILS")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
  indexDir: optional("INDEX_DIR", resolve(REPO_ROOT, "index")),
  // No default — the parent dir containing sibling projects is install-specific.
  projectsRoot: required("PROJECTS_ROOT"),
  uiDist: optional("UI_DIST", resolve(REPO_ROOT, "ui/dist")),
};

export type Config = typeof config;

export function googleCallbackUrl(c: Config = config): string {
  return `${c.baseUrl}${c.pathPrefix}/auth/google/callback`;
}
