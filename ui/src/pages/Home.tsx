import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ProjectsIndex, type TopicsIndex } from "../api.ts";

export function Home(): JSX.Element {
  const [projects, setProjects] = useState<ProjectsIndex | null>(null);
  const [topics, setTopics] = useState<TopicsIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.projects(), api.topics()])
      .then(([p, t]) => { setProjects(p); setTopics(t); })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="error">Failed to load: {error}</div>;
  if (!projects || !topics) return <div className="loading">Loading…</div>;

  return (
    <div className="home">
      <section>
        <h2>Projects</h2>
        <ul className="cards">
          {projects.projects.map(p => (
            <li key={p.name} className="card">
              <Link to={`/projects/${p.name}`} className="card-title">
                {p.frontmatter?.project ?? p.name}
              </Link>
              <div className="card-meta">
                <StatusPill status={p.frontmatter?.status ?? "unknown"} />
                <span className="muted">
                  {p.frontmatter?.last_updated ?? "—"}
                </span>
              </div>
              {p.frontmatter?.status_description && (
                <p className="card-desc">{p.frontmatter.status_description}</p>
              )}
            </li>
          ))}
        </ul>
        {projects.unmigrated.length > 0 && (
          <details className="unmigrated">
            <summary>
              {projects.unmigrated.length} project
              {projects.unmigrated.length === 1 ? "" : "s"} without an AGENTS.md
            </summary>
            <ul>
              {projects.unmigrated.map(u => (
                <li key={u.name}>
                  <code>{u.name}</code>{" "}
                  <span className="muted">
                    has: {u.has.join(", ") || "(no docs)"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <h2>Topics</h2>
        {topics.topics.length === 0 ? (
          <p className="muted">No cross-cutting topics yet.</p>
        ) : (
          <ul className="cards">
            {topics.topics.map(t => (
              <li key={t.slug} className="card">
                <Link to={`/topics/${t.slug}`} className="card-title">
                  {t.frontmatter?.topic ?? t.slug}
                </Link>
                {t.frontmatter?.applies_to && (
                  <div className="card-meta muted">
                    Applies to: {t.frontmatter.applies_to.join(", ")}
                  </div>
                )}
                {t.frontmatter?.status_description && (
                  <p className="card-desc">{t.frontmatter.status_description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }): JSX.Element {
  return <span className={`pill pill-${status}`}>{status}</span>;
}
