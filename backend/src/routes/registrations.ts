import { Router } from "express";
import { Db } from "../db";
import { requirePermission } from "../middleware/auth";
import { cancelSchema, idParamSchema, parse, registrationQuerySchema } from "../schemas";
import { cancelRegistration, listRegistrations } from "../services/registrations";
import { AuthUser } from "../types";

export function registrationsRouter(db: Db): Router {
  const router = Router();

  router.get("/", requirePermission("registrations:read"), (req, res) => {
    res.json(listRegistrations(db, parse(registrationQuerySchema, req.query)));
  });

  router.post("/:id/cancel", requirePermission("registrations:write"), (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { reason } = parse(cancelSchema, req.body ?? {});
    res.json({ data: cancelRegistration(db, req.user as AuthUser, id, reason) });
  });

  return router;
}
