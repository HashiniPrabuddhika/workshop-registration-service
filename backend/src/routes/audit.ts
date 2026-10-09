import { Router } from "express";
import { Db } from "../db";
import { requirePermission } from "../middleware/auth";
import { auditQuerySchema, parse } from "../schemas";
import { listAudit } from "../services/audit";

export function auditRouter(db: Db): Router {
  const router = Router();

  router.get("/", requirePermission("audit:read"), (req, res) => {
    res.json(listAudit(db, parse(auditQuerySchema, req.query)));
  });

  return router;
}
