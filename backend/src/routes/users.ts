import { Router } from "express";
import { Db } from "../db";
import { asyncHandler } from "../middleware/async";
import { requirePermission } from "../middleware/auth";
import { createUserSchema, idParamSchema, parse, updateUserSchema } from "../schemas";
import { createUser, listUsers, updateUser } from "../services/users";
import { AuthUser } from "../types";

export function usersRouter(db: Db): Router {
  const router = Router();
  router.use(requirePermission("users:manage"));

  router.get("/", (_req, res) => {
    res.json({ data: listUsers(db) });
  });

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = parse(createUserSchema, req.body);
      const user = await createUser(db, req.user as AuthUser, input);
      res.status(201).json({ data: user });
    })
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const { id } = parse(idParamSchema, req.params);
      const patch = parse(updateUserSchema, req.body);
      const user = await updateUser(db, req.user as AuthUser, id, patch);
      res.json({ data: user });
    })
  );

  return router;
}
