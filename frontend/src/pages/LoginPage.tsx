import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { homePathFor, useAuth } from "../auth";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && signedIn.role !== "admin" ? from : homePathFor(signedIn.role), { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not sign in. Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit} noValidate>
        <h1>Workshop desk</h1>
        <p className="muted">Sign in with the account your administrator created for you.</p>
        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || !email || !password}>
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
