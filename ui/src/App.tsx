import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { Home } from "./pages/Home.tsx";
import { Login } from "./pages/Login.tsx";
import { Project } from "./pages/Project.tsx";
import { Search } from "./pages/Search.tsx";
import { Topic } from "./pages/Topic.tsx";
import { Validation } from "./pages/Validation.tsx";
import { api, isUnauthenticated, type SessionUser } from "./api.ts";

type AuthState =
  | { kind: "loading" }
  | { kind: "anon" }
  | { kind: "user"; user: SessionUser };

export function App(): JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });

  useEffect(() => {
    api
      .me()
      .then(({ user }) =>
        setAuth(user ? { kind: "user", user } : { kind: "anon" }),
      )
      .catch(e =>
        setAuth(isUnauthenticated(e) ? { kind: "anon" } : { kind: "anon" }),
      );
  }, []);

  if (auth.kind === "loading") {
    return <div className="loading">Loading…</div>;
  }

  if (auth.kind === "anon") {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<RedirectToLogin />} />
      </Routes>
    );
  }

  return (
    <Layout user={auth.user} onLogout={async () => {
      await api.logout();
      setAuth({ kind: "anon" });
    }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects/:name" element={<Project />} />
        <Route path="/topics/:slug" element={<Topic />} />
        <Route path="/search" element={<Search />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

function RedirectToLogin(): JSX.Element {
  const loc = useLocation();
  // Preserve where the user was trying to go, so post-login we could
  // bounce them back. For v1 we just send them to /login; the deep
  // link is preserved in history so the back button still works.
  void loc;
  return <Navigate to="/login" replace />;
}

function NotFound(): JSX.Element {
  return (
    <div className="empty">
      <h2>Not found</h2>
      <p>That page doesn't exist in the wiki.</p>
    </div>
  );
}
