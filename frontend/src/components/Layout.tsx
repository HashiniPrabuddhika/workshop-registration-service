import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { roleLabel } from "../format";

export function Layout() {
  const { user, logout, can } = useAuth();
  if (!user) {
    return null;
  }
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Workshop desk</span>
          <nav className="nav" aria-label="Main">
            {can("manager", "staff") ? <NavLink to="/workshops">Workshops</NavLink> : null}
            {can("admin") ? <NavLink to="/users">Accounts</NavLink> : null}
            {can("admin") ? <NavLink to="/audit">Change log</NavLink> : null}
          </nav>
          <div className="who">
            <span>
              {user.name}
              <small>{roleLabel[user.role]}</small>
            </span>
            <button type="button" className="btn btn-quiet" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
