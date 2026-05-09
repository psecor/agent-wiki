import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown.tsx";
import { api, type BacklinkEntry, type ProjectIndexEntry } from "../api.ts";

interface State {
  project: ProjectIndexEntry;
  raw: string | null;
  backlinks: BacklinkEntry[];
}

export function Project(): JSX.Element {
  const { name } = useParams<{ name: string }>();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    setState(null);
    setError(null);
    api.project(name).then(setState).catch((e: Error) => setError(e.message));
  }, [name]);

  if (error) return <div className="error">Failed to load: {error}</div>;
  if (!state) return <div className="loading">Loading…</div>;

  const fm = state.project.frontmatter;

  return (
    <article className="doc">
      <header className="doc-head">
        <h1>{fm?.project ?? state.project.name}</h1>
        <div className="doc-meta">
          {fm && (
            <>
              <span className={`pill pill-${fm.status}`}>{fm.status}</span>
              <span className="muted">Updated {fm.last_updated}</span>
              <span className="muted">
                by {fm.last_updated_by.join(", ")}
              </span>
            </>
          )}
        </div>
        {fm?.status_description && (
          <p className="doc-status">{fm.status_description}</p>
        )}
      </header>

      <aside className="toc">
        <h3>Sections</h3>
        <ul>
          {state.project.sections.map(s => (
            <li key={s.slug}>
              <a href={`#${s.slug}`}>{s.name}</a>
            </li>
          ))}
        </ul>
        <h3>Cross-refs</h3>
        <ul>
          <li>
            <a href={`/security/projects/${encodeURIComponent(state.project.name)}`}>
              Security findings →
            </a>
          </li>
        </ul>
      </aside>

      <div className="doc-body">
        {state.raw === null ? (
          <p className="muted">Source markdown unavailable.</p>
        ) : (
          <Markdown source={state.raw} />
        )}
      </div>

      <BacklinksSection backlinks={state.backlinks} />
    </article>
  );
}

function BacklinksSection({ backlinks }: { backlinks: BacklinkEntry[] }): JSX.Element | null {
  if (backlinks.length === 0) return null;
  return (
    <section className="backlinks">
      <h2>Linked from</h2>
      <ul>
        {backlinks.map((b, i) => (
          <li key={`${b.from}-${i}`}>
            <Link to={routeForDoc(b.from)}>{b.from}</Link>
            {b.fromSection && <span className="muted"> · {b.fromSection}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function routeForDoc(rel: string): string {
  const proj = rel.match(/^([^/]+)\/AGENTS\.md$/);
  if (proj && proj[1]) return `/projects/${proj[1]}`;
  const topic = rel.match(/^topics\/([^/]+)\.md$/);
  if (topic && topic[1]) return `/topics/${topic[1]}`;
  return "/";
}
