import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ValidationReport } from "../api.ts";

export function Validation(): JSX.Element {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.validation().then(setReport).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="error">Failed to load: {error}</div>;
  if (!report) return <div className="loading">Loading…</div>;

  return (
    <div className="validation">
      <h1>Validation</h1>
      <p className="muted">
        Generated {report.generated_at} · {report.summary.total} issue
        {report.summary.total === 1 ? "" : "s"} (
        errors: {report.summary.bySeverity.error ?? 0},{" "}
        warnings: {report.summary.bySeverity.warning ?? 0},{" "}
        info: {report.summary.bySeverity.info ?? 0}
        )
      </p>
      {report.issues.length === 0 ? (
        <p>All good — no issues to report.</p>
      ) : (
        <table className="issues">
          <thead>
            <tr>
              <th>Severity</th>
              <th>File</th>
              <th>Kind</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {report.issues.map((iss, i) => (
              <tr key={i} className={`sev-${iss.severity}`}>
                <td>{iss.severity}</td>
                <td>
                  <Link to={routeForDoc(iss.file)}>{iss.file}</Link>
                </td>
                <td><code>{iss.kind}</code></td>
                <td>{iss.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function routeForDoc(rel: string): string {
  const proj = rel.match(/^([^/]+)\/AGENTS\.md$/);
  if (proj && proj[1]) return `/projects/${proj[1]}`;
  const topic = rel.match(/^topics\/([^/]+)\.md$/);
  if (topic && topic[1]) return `/topics/${topic[1]}`;
  return "/";
}
