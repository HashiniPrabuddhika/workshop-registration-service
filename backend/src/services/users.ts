import bcrypt from "bcryptjs";
import { Db } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { AuthUser, Role } from "../types";
import { recordAudit } from "./audit";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: number;
  created_at: string;
}

const COLUMNS = "id, name, email, role, is_active, created_at";

export function toUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active === 1,
    createdAt: row.created_at
  };
}

export function listUsers(db: Db) {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM users ORDER BY created_at ASC, id ASC`).all() as UserRow[];
  return rows.map(toUser);
}

export async function createUser(
  db: Db,
  actor: AuthUser,
  input: { name: string; email: string; password: string; role: Role }
) {
  const hash = await bcrypt.hash(input.password, 10);
  const run = db.transaction(() => {
    try {
      const result = db
        .prepare("INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(input.name, input.email, hash, input.role, new Date().toISOString());
      const id = Number(result.lastInsertRowid);
      recordAudit(db, actor.id, "user.created", "user", id, { email: input.email, role: input.role });
      return id;
    } catch (error) {
      if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw conflict("EMAIL_TAKEN", "An account with this email already exists");
      }
      throw error;
    }
  });
  const id = run.immediate();
  return toUser(db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow);
}

export async function updateUser(
  db: Db,
  actor: AuthUser,
  id: number,
  patch: { name?: string; role?: Role; isActive?: boolean; password?: string }
) {
  const hash = patch.password ? await bcrypt.hash(patch.password, 10) : undefined;
  const run = db.transaction(() => {
    const current = db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow | undefined;
    if (!current) {
      throw notFound("User not found");
    }
    const roleChanges = patch.role !== undefined && patch.role !== current.role;
    const deactivates = patch.isActive === false && current.is_active === 1;
    if (id === actor.id && (roleChanges || deactivates)) {
      throw badRequest("CANNOT_MODIFY_SELF", "You cannot change your own role or deactivate your own account");
    }
    if (current.role === "admin" && current.is_active === 1 && (roleChanges || deactivates)) {
      const others = (
        db
          .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?")
          .get(id) as { c: number }
      ).c;
      if (others === 0) {
        throw conflict("LAST_ADMIN", "At least one active admin account is required");
      }
    }
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (patch.name !== undefined && patch.name !== current.name) {
      changes.name = { from: current.name, to: patch.name };
    }
    if (roleChanges) {
      changes.role = { from: current.role, to: patch.role };
    }
    if (patch.isActive !== undefined && (patch.isActive ? 1 : 0) !== current.is_active) {
      changes.isActive = { from: current.is_active === 1, to: patch.isActive };
    }
    const next = {
      name: patch.name ?? current.name,
      role: patch.role ?? current.role,
      isActive: patch.isActive === undefined ? current.is_active : patch.isActive ? 1 : 0
    };
    db.prepare("UPDATE users SET name = ?, role = ?, is_active = ? WHERE id = ?").run(
      next.name,
      next.role,
      next.isActive,
      id
    );
    if (hash) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
    }
    if (Object.keys(changes).length > 0 || hash) {
      recordAudit(db, actor.id, "user.updated", "user", id, {
        email: current.email,
        changes,
        ...(hash ? { passwordReset: true } : {})
      });
    }
    return toUser(db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow);
  });
  return run.immediate();
}
