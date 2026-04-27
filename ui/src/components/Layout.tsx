import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SessionUser } from "../api.ts";

interface Props {
  user: SessionUser;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ user, onLogout, children }: Props): JSX.Element {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  function onSearch(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">agent-wiki</Link>
        <form className="searchbox" onSubmit={onSearch}>
          <input
            type="search"
            placeholder="Search…"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search"
          />
        </form>
        <nav className="navlinks">
          <Link to="/">Projects</Link>
          <Link to="/validation">Validation</Link>
        </nav>
        <div className="user">
          <span title={user.email}>{user.name}</span>
          <button type="button" onClick={onLogout} className="linkbtn">
            Sign out
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
