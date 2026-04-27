// Environment-driven server config. Fail fast on missing required values.

import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required in environment`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

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
  indexDir: optional("INDEX_DIR", "/home/secorp/termag/projects/agent-wiki/index"),
  projectsRoot: optional("PROJECTS_ROOT", "/home/secorp/termag/projects"),
  uiDist: optional("UI_DIST", "/home/secorp/termag/projects/agent-wiki/ui/dist"),
};

export type Config = typeof config;

export function googleCallbackUrl(c: Config = config): string {
  return `${c.baseUrl}${c.pathPrefix}/auth/google/callback`;
}
