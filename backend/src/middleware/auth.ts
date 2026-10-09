import { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { Db } from "../db";
import { forbidden, unauthorized } from "../errors";
import { Permission, can } from "../permissions";
import { AuthUser } from "../types";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: AuthUser["role"];
  is_active: number;
}

export function authenticate(db: Db): RequestHandler {
  const findUser = db.prepare("SELECT id, name, email, role, is_active FROM users WHERE id = ?");
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return next(unauthorized());
    }
    let subject: number;
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
      subject = Number(payload.sub);
    } catch {
      return next(unauthorized("Your session has expired. Please sign in again"));
    }
    const row = findUser.get(subject) as UserRow | undefined;
    if (!row || !row.is_active) {
      return next(unauthorized("Your session is no longer valid. Please sign in again"));
    }
    req.user = { id: row.id, name: row.name, email: row.email, role: row.role };
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(unauthorized());
    }
    if (!can(req.user.role, permission)) {
      return next(forbidden());
    }
    next();
  };
}
