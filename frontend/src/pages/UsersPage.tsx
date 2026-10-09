import { FormEvent, useState } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { ErrorNotice, fieldErrors } from "../components/ErrorNotice";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { formatStamp, roleLabel } from "../format";
import { useFetch } from "../hooks";
import type { ManagedUser, Role } from "../types";

const ROLES: Role[] = ["staff", "manager", "admin"];

export function UsersPage() {
  const { user: me } = useAuth();
  const notify = useToast();
  const { data, error, loading, reload } = useFetch(() => api.listUsers(), []);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Only admins can create accounts. There is no public signup.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Add account
        </button>
      </div>

      {error ? <ErrorNotice error={error} onRetry={reload} /> : null}
      {loading && !data ? <p className="page-status">Loading</p> : null}

      {data ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((account) => (
                <tr key={account.id} className={account.isActive ? undefined : "row-muted"}>
                  <td>
                    <strong>{account.name}</strong>
                    <span className="sub">{account.email}</span>
                  </td>
                  <td>{roleLabel[account.role]}</td>
                  <td>
                    <span className={account.isActive ? "badge badge-active" : "badge badge-cancelled"}>
                      {account.isActive ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td>{formatStamp(account.createdAt)}</td>
                  <td className="right">
                    <button type="button" className="btn" onClick={() => setEditing(account)}>
                      Edit
                    </button>
                    {account.id === me?.id ? <span className="sub">This is you</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {creating ? (
        <CreateUserDialog
          onClose={() => setCreating(false)}
          onSaved={(account) => {
            setCreating(false);
            notify(`Created account for ${account.name}`);
            reload();
          }}
        />
      ) : null}

      {editing ? (
        <EditUserDialog
          account={editing}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("Account updated");
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function CreateUserDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (user: ManagedUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const errors = fieldErrors(error);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.createUser({ name, email, password, role });
      onSaved(result.data);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason : new ApiError(0, "UNKNOWN", "Something went wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add account" onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        {error && Object.keys(errors).length === 0 ? <ErrorNotice error={error} /> : null}
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
          {errors.name ? <em className="field-error">{errors.name}</em> : null}
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          {errors.email ? <em className="field-error">{errors.email}</em> : null}
        </label>
        <label className="field">
          <span>Temporary password</span>
          <input type="text" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {errors.password ? <em className="field-error">{errors.password}</em> : <small>At least 8 characters.</small>}
        </label>
        <label className="field">
          <span>Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Discard
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Creating" : "Create account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface EditProps {
  account: ManagedUser;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditUserDialog({ account, isSelf, onClose, onSaved }: EditProps) {
  const [name, setName] = useState(account.name);
  const [role, setRole] = useState<Role>(account.role);
  const [isActive, setIsActive] = useState(account.isActive);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const errors = fieldErrors(error);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateUser(account.id, {
        name,
        role,
        isActive,
        ...(password ? { password } : {})
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason : new ApiError(0, "UNKNOWN", "Something went wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit ${account.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        {error && Object.keys(errors).length === 0 ? <ErrorNotice error={error} /> : null}
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
          {errors.name ? <em className="field-error">{errors.name}</em> : null}
        </label>
        <label className="field">
          <span>Role</span>
          <select value={role} disabled={isSelf} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel[value]}
              </option>
            ))}
          </select>
          {isSelf ? <small>You cannot change your own role.</small> : null}
        </label>
        <label className="toggle">
          <input type="checkbox" checked={isActive} disabled={isSelf} onChange={(event) => setIsActive(event.target.checked)} />
          <span>Account is active</span>
        </label>
        <label className="field">
          <span>New password</span>
          <input type="text" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} />
          {errors.password ? <em className="field-error">{errors.password}</em> : <small>Leave empty to keep the current password.</small>}
        </label>
        <div className="actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Discard
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
