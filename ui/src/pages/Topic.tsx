import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown.tsx";
import { api, type BacklinkEntry, type TopicIndexEntry } from "../api.ts";

interface State {
  topic: TopicIndexEntry;
  raw: string | null;
  backlinks: BacklinkEntry[];
}

export function Topic(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setState(null);
    setError(null);
    api.topic(slug).then(setState).catch((e: Error) => setError(e.message));
  }, [slug]);

  if (error) return <div className="error">Failed to load: {error}</div>;
  if (!state) return <div className="loading">Loading…</div>;

  const fm = state.topic.frontmatter;

  return (
    <article className="doc">
      <header className="doc-head">
        <h1>{fm?.topic ?? state.topic.slug}</h1>
        <div className="doc-meta">
          {fm && (
            <>
              <span className="muted">Updated {fm.last_updated}</span>
              <span className="muted">
                by {fm.last_updated_by.join(", ")}
              </span>
            </>
          )}
        </div>
        {fm?.applies_to && (
          <p className="doc-applies">
            Applies to: {fm.applies_to.join(", ")}
          </p>
        )}
      </header>

      <div className="doc-body">
        {state.raw === null ? (
          <p className="muted">Source markdown unavailable.</p>
        ) : (
          <Markdown source={state.raw} />
        )}
      </div>

      {state.backlinks.length > 0 && (
        <section className="backlinks">
          <h2>Seen in</h2>
          <ul>
            {state.backlinks.map((b, i) => (
              <li key={`${b.from}-${i}`}>
                <Link to={routeForDoc(b.from)}>{b.from}</Link>
                {b.fromSection && (
                  <span className="muted"> · {b.fromSection}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function routeForDoc(rel: string): string {
  const proj = rel.match(/^([^/]+)\/AGENTS\.md$/);
  if (proj && proj[1]) return `/projects/${proj[1]}`;
  const topic = rel.match(/^topics\/([^/]+)\.md$/);
  if (topic && topic[1]) return `/topics/${topic[1]}`;
  return "/";
}
