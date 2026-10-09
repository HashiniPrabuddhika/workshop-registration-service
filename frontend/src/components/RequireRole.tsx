import { Navigate, Outlet, useLocation } from "react-router-dom";
import { homePathFor, useAuth } from "../auth";
import type { Role } from "../types";

export function RequireRole({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <p className="page-status">Loading</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  return <Outlet />;
}
