import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type SearchEntry } from "../api.ts";

export function Search(): JSX.Element {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [results, setResults] = useState<SearchEntry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setTruncated(false);
      return;
    }
    setResults(null);
    setError(null);
    api
      .search(q)
      .then(r => {
        setResults(r.results);
        setTruncated(r.truncated ?? false);
      })
      .catch((e: Error) => setError(e.message));
  }, [q]);

  if (error) return <div className="error">Search failed: {error}</div>;

  return (
    <div className="search">
      <h1>Search</h1>
      {q.trim().length < 2 ? (
        <p className="muted">Type at least 2 characters in the search bar.</p>
      ) : results === null ? (
        <div className="loading">Searching…</div>
      ) : results.length === 0 ? (
        <p className="muted">No matches for “{q}”.</p>
      ) : (
        <>
          <p className="muted">
            {results.length} match{results.length === 1 ? "" : "es"} for “{q}”
            {truncated && " (truncated)"}
          </p>
          <ul className="results">
            {results.map(r => (
              <li key={r.id} className="result">
                <Link to={routeFor(r)}>
                  <strong>
                    {r.docKind === "project" ? r.project : r.topic}
                  </strong>{" "}
                  · {r.section}
                </Link>
                <Snippet text={r.body} q={q} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function routeFor(r: SearchEntry): string {
  const sectionSlug = r.id.split("#")[1];
  const hash = sectionSlug ? `#${sectionSlug}` : "";
  if (r.docKind === "project" && r.project) {
    return `/projects/${r.project}${hash}`;
  }
  if (r.docKind === "topic" && r.topic) {
    return `/topics/${r.topic}${hash}`;
  }
  return "/";
}

function Snippet({ text, q }: { text: string; q: string }): JSX.Element {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) {
    return <p className="snippet muted">{text.slice(0, 240)}…</p>;
  }
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + q.length + 160);
  const before = text.slice(start, idx);
  const hit = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length, end);
  return (
    <p className="snippet">
      {start > 0 && "…"}
      {before}
      <mark>{hit}</mark>
      {after}
      {end < text.length && "…"}
    </p>
  );
}
