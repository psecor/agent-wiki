// Server entry. Express + session + Passport + static UI hosting.
//
// Path layout (everything under PATH_PREFIX, default /wiki):
//   /wiki/                     UI (React SPA, history fallback)
//   /wiki/auth/google          OAuth start
//   /wiki/auth/google/callback OAuth callback
//   /wiki/auth/logout          POST to log out
//   /wiki/api/*                JSON API (auth-gated)
//   /wiki/static/*, /wiki/assets/*  static UI bundle

import express from "express";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import passport from "passport";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "./config.js";
import { authRoutes } from "./auth.js";
import { apiRoutes } from "./api.js";
import { createDataLayer } from "./data.js";

async function main(): Promise<void> {
  const FileStore = FileStoreFactory(session);
  const app = express();

  // Behind Apache reverse proxy.
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "1mb" }));

  app.use(
    session({
      store: new FileStore({ path: ".sessions", ttl: 60 * 60 * 24 * 30 /* 30d */ }),
      secret: config.sessionSecret,
      name: "agentwiki.sid",
      resave: false,
      saveUninitialized: false,
      cookie: {
        path: config.pathPrefix,
        httpOnly: true,
        secure: config.baseUrl.startsWith("https://"),
        maxAge: 1000 * 60 * 60 * 24 * 30,
        sameSite: "lax",
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  const data = createDataLayer({
    indexDir: config.indexDir,
    projectsRoot: config.projectsRoot,
  });

  // All app routes are mounted under PATH_PREFIX.
  const router = express.Router();
  router.use(authRoutes(config.pathPrefix));
  router.use(apiRoutes(data));

  // Static UI + SPA fallback. The UI build sets `base: PATH_PREFIX` so its
  // asset URLs already include the prefix.
  router.use(express.static(config.uiDist, { index: false }));
  router.get("*", async (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) return next();
    try {
      const indexHtml = path.join(config.uiDist, "index.html");
      const exists = await fs
        .access(indexHtml)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        res.status(503).type("text").send(
          `agent-wiki UI not built. Run \`npm install && npm run build\` in ui/.\nExpected at: ${indexHtml}\n`,
        );
        return;
      }
      res.sendFile(indexHtml);
    } catch (e) {
      next(e);
    }
  });

  app.use(config.pathPrefix, router);

  // Bare-root convenience: redirect / to PATH_PREFIX/ so localhost works directly.
  app.get("/", (_req, res) => res.redirect(config.pathPrefix + "/"));

  // Error handler — last.
  app.use(((err, _req, res, _next) => {
    console.error("[server] error:", err);
    res.status(500).json({ error: "internal_error" });
  }) as express.ErrorRequestHandler);

  app.listen(config.port, "127.0.0.1", () => {
    console.log(
      `[agent-wiki] listening on 127.0.0.1:${config.port}, mounted at ${config.pathPrefix}`,
    );
    console.log(`[agent-wiki] allowed emails: ${config.allowedEmails.join(", ")}`);
    console.log(`[agent-wiki] reading index from: ${config.indexDir}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
