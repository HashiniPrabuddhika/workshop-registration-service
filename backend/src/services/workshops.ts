import { Db } from "../db";
import { conflict, notFound } from "../errors";
import { AuthUser } from "../types";
import { recordAudit } from "./audit";

export type WorkshopStatus = "scheduled" | "cancelled" | "completed";

interface WorkshopRow {
  id: number;
  code: string;
  title: string;
  instructor: string;
  description: string;
  location: string;
  starts_at: string;
  duration_minutes: number;
  capacity: number;
  status: WorkshopStatus;
  active_count: number;
  created_at: string;
  updated_at: string;
}

const WITH_COUNTS = `
  SELECT w.*,
    (SELECT COUNT(*) FROM registrations r WHERE r.workshop_id = w.id AND r.status = 'active') AS active_count
  FROM workshops w
`;

export function toWorkshop(row: WorkshopRow) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    instructor: row.instructor,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    capacity: row.capacity,
    status: row.status,
    activeCount: row.active_count,
    seatsAvailable: Math.max(row.capacity - row.active_count, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface WorkshopFilters {
  from?: string;
  to?: string;
  status?: WorkshopStatus;
  hasSeats?: boolean;
  q?: string;
  page: number;
  pageSize: number;
}

export function searchWorkshops(db: Db, filters: WorkshopFilters) {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.from) {
    clauses.push("starts_at >= @from");
    params.from = filters.from;
  }
  if (filters.to) {
    clauses.push("starts_at <= @to");
    params.to = filters.to;
  }
  if (filters.status) {
    clauses.push("status = @status");
    params.status = filters.status;
  }
  if (filters.hasSeats) {
    clauses.push("status = 'scheduled' AND capacity > active_count");
  }
  if (filters.q) {
    clauses.push(
      "(code LIKE @q ESCAPE '\\' OR title LIKE @q ESCAPE '\\' OR instructor LIKE @q ESCAPE '\\')"
    );
    params.q = `%${filters.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM (${WITH_COUNTS}) ${where}`).get(params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT * FROM (${WITH_COUNTS}) ${where} ORDER BY starts_at ASC, id ASC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize }) as WorkshopRow[];
  return {
    data: rows.map(toWorkshop),
    meta: { page: filters.page, pageSize: filters.pageSize, total }
  };
}

export function getWorkshop(db: Db, id: number) {
  const row = db.prepare(`SELECT * FROM (${WITH_COUNTS}) WHERE id = ?`).get(id) as WorkshopRow | undefined;
  if (!row) {
    throw notFound("Workshop not found");
  }
  return toWorkshop(row);
}

export interface WorkshopInput {
  code: string;
  title: string;
  instructor: string;
  description: string;
  location: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
}

export function createWorkshop(db: Db, actor: AuthUser, input: WorkshopInput) {
  const run = db.transaction(() => {
    try {
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO workshops
             (code, title, instructor, description, location, starts_at, duration_minutes, capacity, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.code,
          input.title,
          input.instructor,
          input.description,
          input.location,
          input.startsAt,
          input.durationMinutes,
          input.capacity,
          actor.id,
          now,
          now
        );
      const id = Number(result.lastInsertRowid);
      recordAudit(db, actor.id, "workshop.created", "workshop", id, {
        code: input.code,
        title: input.title,
        capacity: input.capacity
      });
      return id;
    } catch (error) {
      if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw conflict("CODE_TAKEN", "A workshop with this code already exists");
      }
      throw error;
    }
  });
  return getWorkshop(db, run.immediate());
}

const FIELD_TO_COLUMN = {
  code: "code",
  title: "title",
  instructor: "instructor",
  description: "description",
  location: "location",
  startsAt: "starts_at",
  durationMinutes: "duration_minutes",
  capacity: "capacity",
  status: "status"
} as const;

type Patch = Partial<WorkshopInput & { status: WorkshopStatus }>;

export function updateWorkshop(db: Db, actor: AuthUser, id: number, patch: Patch) {
  const run = db.transaction(() => {
    const current = db.prepare(`SELECT * FROM (${WITH_COUNTS}) WHERE id = ?`).get(id) as WorkshopRow | undefined;
    if (!current) {
      throw notFound("Workshop not found");
    }
    const currentView = toWorkshop(current) as Record<string, unknown>;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const assignments: string[] = [];
    const values: Record<string, unknown> = { id };
    for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
      const next = (patch as Record<string, unknown>)[field];
      if (next !== undefined && next !== currentView[field]) {
        changes[field] = { from: currentView[field], to: next };
        assignments.push(`${column} = @${field}`);
        values[field] = next;
      }
    }
    if (assignments.length === 0) {
      return;
    }
    if (patch.capacity !== undefined && patch.capacity < current.active_count) {
      throw conflict(
        "CAPACITY_BELOW_REGISTRATIONS",
        `${current.active_count} seats are already taken. Cancel registrations before lowering capacity below that`
      );
    }
    values.updatedAt = new Date().toISOString();
    try {
      db.prepare(`UPDATE workshops SET ${assignments.join(", ")}, updated_at = @updatedAt WHERE id = @id`).run(values);
    } catch (error) {
      if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw conflict("CODE_TAKEN", "A workshop with this code already exists");
      }
      throw error;
    }
    recordAudit(db, actor.id, "workshop.updated", "workshop", id, { code: current.code, changes });
  });
  run.immediate();
  return getWorkshop(db, id);
}
