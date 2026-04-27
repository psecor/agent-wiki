import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

interface Props {
  source: string;
}

// Renders an AGENTS.md / topic body. Internal cross-doc links —
// "../other-project/AGENTS.md" or "../topics/foo.md" — are rewritten
// to wiki SPA routes so navigation stays in-app. External links open
// in a new tab.
export function Markdown({ source }: Props): JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ href, children, ...rest }) {
          const route = toWikiRoute(href);
          if (route) {
            return <Link to={route}>{children}</Link>;
          }
          if (href && /^https?:/i.test(href)) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                {children}
              </a>
            );
          }
          return <a href={href} {...rest}>{children}</a>;
        },
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

function toWikiRoute(href: string | undefined): string | null {
  if (!href) return null;
  // Strip leading "./" and any number of "../"; we only care about the
  // tail, which the indexer's link resolution already canonicalizes
  // (e.g. "rssreader/AGENTS.md", "topics/postgres-jsonb-ordering.md").
  const cleaned = href.replace(/^(\.\/)+/, "").replace(/^(\.\.\/)+/, "");
  const projectMatch = cleaned.match(/^([^/]+)\/AGENTS\.md(#.*)?$/);
  if (projectMatch && projectMatch[1]) {
    return `/projects/${projectMatch[1]}${projectMatch[2] ?? ""}`;
  }
  const topicMatch = cleaned.match(/^topics\/([^/]+)\.md(#.*)?$/);
  if (topicMatch && topicMatch[1]) {
    return `/topics/${topicMatch[1]}${topicMatch[2] ?? ""}`;
  }
  return null;
}
