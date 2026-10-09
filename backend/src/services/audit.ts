import { Db } from "../db";

export type AuditEntity = "user" | "workshop";

export function recordAudit(
  db: Db,
  actorId: number,
  action: string,
  entityType: AuditEntity,
  entityId: number,
  details: Record<string, unknown> = {}
): void {
  db.prepare(
    "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(actorId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString());
}

interface AuditRow {
  id: number;
  actor_id: number;
  actor_name: string;
  action: string;
  entity_type: AuditEntity;
  entity_id: number;
  details: string;
  created_at: string;
}

export function listAudit(db: Db, filters: { entityType?: AuditEntity; page: number; pageSize: number }) {
  const where = filters.entityType ? "WHERE a.entity_type = @entityType" : "";
  const params = filters.entityType ? { entityType: filters.entityType } : {};
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM audit_log a ${where}`).get(params) as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS actor_name FROM audit_log a JOIN users u ON u.id = a.actor_id
       ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize }) as AuditRow[];
  return {
    data: rows.map((row) => ({
      id: row.id,
      actor: { id: row.actor_id, name: row.actor_name },
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: JSON.parse(row.details) as Record<string, unknown>,
      createdAt: row.created_at
    })),
    meta: { page: filters.page, pageSize: filters.pageSize, total }
  };
}
