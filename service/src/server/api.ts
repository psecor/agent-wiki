// JSON API for the UI and for agents.
//
// All endpoints behind ensureAuth. All paths under /api.

import express from "express";
import { ensureAuth } from "./auth.js";
import type { DataLayer } from "./data.js";

export function apiRoutes(data: DataLayer): express.Router {
  const r = express.Router();

  // Health is the only unauthenticated API endpoint — register before
  // the ensureAuth middleware so it stays open.
  r.get("/api/health", (_req, res) => res.json({ ok: true }));

  r.use("/api", ensureAuth);

  r.get("/api/projects", async (_req, res, next) => {
    try {
      res.json(await data.projects());
    } catch (e) {
      next(e);
    }
  });

  r.get("/api/projects/:name", async (req, res, next) => {
    try {
      const projects = await data.projects();
      const project = projects.projects.find(p => p.name === req.params.name);
      if (!project) return res.status(404).json({ error: "not_found" });
      const raw = await data.rawDoc(project.relativePath);
      const backlinks = (await data.backlinks()).backlinks[project.relativePath] ?? [];
      res.json({ project, raw, backlinks });
    } catch (e) {
      next(e);
    }
  });

  r.get("/api/topics", async (_req, res, next) => {
    try {
      res.json(await data.topics());
    } catch (e) {
      next(e);
    }
  });

  r.get("/api/topics/:slug", async (req, res, next) => {
    try {
      const topics = await data.topics();
      const topic = topics.topics.find(t => t.slug === req.params.slug);
      if (!topic) return res.status(404).json({ error: "not_found" });
      const raw = await data.rawDoc(topic.relativePath);
      const backlinks = (await data.backlinks()).backlinks[topic.relativePath] ?? [];
      res.json({ topic, raw, backlinks });
    } catch (e) {
      next(e);
    }
  });

  r.get("/api/search", async (req, res, next) => {
    try {
      const q = String(req.query.q ?? "").trim().toLowerCase();
      if (q.length < 2) return res.json({ query: q, results: [] });
      const idx = await data.search();
      const results = idx.entries.filter(e => {
        return (
          e.body.toLowerCase().includes(q) ||
          e.section.toLowerCase().includes(q) ||
          (e.project ?? "").toLowerCase().includes(q) ||
          (e.topic ?? "").toLowerCase().includes(q)
        );
      });
      // Cap to keep responses small.
      res.json({ query: q, results: results.slice(0, 100), truncated: results.length > 100 });
    } catch (e) {
      next(e);
    }
  });

  r.get("/api/validation", async (_req, res, next) => {
    try {
      res.json(await data.validation());
    } catch (e) {
      next(e);
    }
  });

  return r;
}
