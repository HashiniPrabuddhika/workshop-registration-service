import { Navigate, Route, Routes } from "react-router-dom";
import { homePathFor, useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { RequireRole } from "./components/RequireRole";
import { AuditPage } from "./pages/AuditPage";
import { LoginPage } from "./pages/LoginPage";
import { UsersPage } from "./pages/UsersPage";
import { WorkshopDetailPage } from "./pages/WorkshopDetailPage";
import { WorkshopsPage } from "./pages/WorkshopsPage";

function Home() {
  const { user, loading } = useAuth();
  if (loading) {
    return <p className="page-status">Loading</p>;
  }
  return <Navigate to={user ? homePathFor(user.role) : "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireRole />}>
        <Route element={<Layout />}>
          <Route element={<RequireRole roles={["manager", "staff"]} />}>
            <Route path="/workshops" element={<WorkshopsPage />} />
            <Route path="/workshops/:id" element={<WorkshopDetailPage />} />
          </Route>
          <Route element={<RequireRole roles={["admin"]} />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/audit" element={<AuditPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
