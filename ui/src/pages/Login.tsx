import { loginUrl } from "../api.ts";

export function Login(): JSX.Element {
  return (
    <div className="login">
      <h1>agent-wiki</h1>
      <p>Sign in with Google to browse project wikis and topics.</p>
      <a className="btn" href={loginUrl}>Sign in with Google</a>
      <p className="muted">
        Access is restricted to allowlisted accounts.
      </p>
    </div>
  );
}
