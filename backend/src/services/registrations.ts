import { Db } from "../db";
import { AppError, conflict, notFound } from "../errors";
import { AuthUser } from "../types";

interface RegistrationRow {
  id: number;
  workshop_id: number;
  workshop_code: string;
  workshop_title: string;
  attendee_name: string;
  attendee_email: string;
  status: "active" | "cancelled";
  registered_by: number;
  registered_by_name: string;
  registered_at: string;
  cancelled_by: number | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

const SELECT = `
  SELECT r.*, w.code AS workshop_code, w.title AS workshop_title,
         ru.name AS registered_by_name, cu.name AS cancelled_by_name
  FROM registrations r
  JOIN workshops w ON w.id = r.workshop_id
  JOIN users ru ON ru.id = r.registered_by
  LEFT JOIN users cu ON cu.id = r.cancelled_by
`;

export function toRegistration(row: RegistrationRow) {
  return {
    id: row.id,
    workshopId: row.workshop_id,
    workshopCode: row.workshop_code,
    workshopTitle: row.workshop_title,
    attendeeName: row.attendee_name,
    attendeeEmail: row.attendee_email,
    status: row.status,
    registeredBy: { id: row.registered_by, name: row.registered_by_name },
    registeredAt: row.registered_at,
    cancelledBy: row.cancelled_by ? { id: row.cancelled_by, name: row.cancelled_by_name as string } : null,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason
  };
}

function getRegistration(db: Db, id: number) {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as RegistrationRow | undefined;
  if (!row) {
    throw notFound("Registration not found");
  }
  return toRegistration(row);
}

function translateConstraint(error: unknown): never {
  const { code, message } = error as { code?: string; message?: string };
  if (code === "SQLITE_CONSTRAINT_UNIQUE") {
    throw conflict("ALREADY_REGISTERED", "This person is already registered for this workshop");
  }
  if (message?.includes("capacity_exceeded")) {
    throw conflict("WORKSHOP_FULL", "This workshop is full");
  }
  throw error;
}

export function registerAttendee(
  db: Db,
  actor: AuthUser,
  workshopId: number,
  input: { attendeeName: string; attendeeEmail: string }
) {
  const run = db.transaction(() => {
    const workshop = db
      .prepare("SELECT id, capacity, status, starts_at, duration_minutes FROM workshops WHERE id = ?")
      .get(workshopId) as
      | { id: number; capacity: number; status: string; starts_at: string; duration_minutes: number }
      | undefined;
    if (!workshop) {
      throw notFound("Workshop not found");
    }
    if (workshop.status !== "scheduled") {
      throw conflict("WORKSHOP_NOT_OPEN", `Registration is closed because this workshop is ${workshop.status}`);
    }
    const endsAt = new Date(workshop.starts_at).getTime() + workshop.duration_minutes * 60_000;
    if (endsAt <= Date.now()) {
      throw conflict("WORKSHOP_ENDED", "This workshop has already ended");
    }
    const taken = (
      db
        .prepare("SELECT COUNT(*) AS c FROM registrations WHERE workshop_id = ? AND status = 'active'")
        .get(workshopId) as { c: number }
    ).c;
    if (taken >= workshop.capacity) {
      throw conflict("WORKSHOP_FULL", "This workshop is full");
    }
    const result = db
      .prepare(
        `INSERT INTO registrations (workshop_id, attendee_name, attendee_email, status, registered_by, registered_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .run(workshopId, input.attendeeName, input.attendeeEmail, actor.id, new Date().toISOString());
    return Number(result.lastInsertRowid);
  });
  let id: number;
  try {
    id = run.immediate();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    return translateConstraint(error);
  }
  return getRegistration(db, id);
}

export function cancelRegistration(db: Db, actor: AuthUser, id: number, reason?: string) {
  const run = db.transaction(() => {
    const current = db.prepare("SELECT status FROM registrations WHERE id = ?").get(id) as
      | { status: string }
      | undefined;
    if (!current) {
      throw notFound("Registration not found");
    }
    if (current.status === "cancelled") {
      throw conflict("ALREADY_CANCELLED", "This registration is already cancelled");
    }
    db.prepare(
      `UPDATE registrations
       SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason = ?
       WHERE id = ? AND status = 'active'`
    ).run(actor.id, new Date().toISOString(), reason || null, id);
  });
  run.immediate();
  return getRegistration(db, id);
}

export interface RegistrationFilters {
  workshopId?: number;
  status?: "active" | "cancelled";
  email?: string;
  page: number;
  pageSize: number;
}

export function listRegistrations(db: Db, filters: RegistrationFilters) {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.workshopId) {
    clauses.push("r.workshop_id = @workshopId");
    params.workshopId = filters.workshopId;
  }
  if (filters.status) {
    clauses.push("r.status = @status");
    params.status = filters.status;
  }
  if (filters.email) {
    clauses.push("r.attendee_email LIKE @email ESCAPE '\\'");
    params.email = `%${filters.email.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM registrations r ${where}`).get(params) as { c: number }
  ).c;
  const rows = db
    .prepare(`${SELECT} ${where} ORDER BY r.registered_at DESC, r.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize }) as RegistrationRow[];
  return {
    data: rows.map(toRegistration),
    meta: { page: filters.page, pageSize: filters.pageSize, total }
  };
}
