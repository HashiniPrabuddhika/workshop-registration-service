import { Router } from "express";
import { Db } from "../db";
import { requirePermission } from "../middleware/auth";
import {
  createWorkshopSchema,
  idParamSchema,
  parse,
  registerSchema,
  registrationQuerySchema,
  updateWorkshopSchema,
  workshopQuerySchema
} from "../schemas";
import { listRegistrations, registerAttendee } from "../services/registrations";
import { createWorkshop, getWorkshop, searchWorkshops, updateWorkshop } from "../services/workshops";
import { AuthUser } from "../types";

export function workshopsRouter(db: Db): Router {
  const router = Router();

  router.get("/", requirePermission("workshops:read"), (req, res) => {
    res.json(searchWorkshops(db, parse(workshopQuerySchema, req.query)));
  });

  router.post("/", requirePermission("workshops:write"), (req, res) => {
    const workshop = createWorkshop(db, req.user as AuthUser, parse(createWorkshopSchema, req.body));
    res.status(201).json({ data: workshop });
  });

  router.get("/:id", requirePermission("workshops:read"), (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json({ data: getWorkshop(db, id) });
  });

  router.patch("/:id", requirePermission("workshops:write"), (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const workshop = updateWorkshop(db, req.user as AuthUser, id, parse(updateWorkshopSchema, req.body));
    res.json({ data: workshop });
  });

  router.get("/:id/registrations", requirePermission("registrations:read"), (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    getWorkshop(db, id);
    const query = parse(registrationQuerySchema, { ...req.query, workshopId: id });
    res.json(listRegistrations(db, query));
  });

  router.post("/:id/registrations", requirePermission("registrations:write"), (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const registration = registerAttendee(db, req.user as AuthUser, id, parse(registerSchema, req.body));
    res.status(201).json({ data: registration });
  });

  return router;
}
