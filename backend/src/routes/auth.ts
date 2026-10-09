import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { Db } from "../db";
import { AppError } from "../errors";
import { asyncHandler } from "../middleware/async";
import { authenticate } from "../middleware/auth";
import { loginSchema, parse } from "../schemas";
import { Role } from "../types";

interface LoginRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: number;
  password_hash: string;
}

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export function authRouter(db: Db): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.nodeEnv === "test",
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: "TOO_MANY_ATTEMPTS", message: "Too many sign-in attempts. Try again in a few minutes" }
      });
    }
  });

  router.post(
    "/login",
    limiter,
    asyncHandler(async (req, res) => {
      const { email, password } = parse(loginSchema, req.body);
      const row = db
        .prepare("SELECT id, name, email, role, is_active, password_hash FROM users WHERE email = ?")
        .get(email) as LoginRow | undefined;
      const matches = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
      if (!row || !matches || !row.is_active) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
      }
      const token = jwt.sign({ sub: String(row.id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
      res.json({ token, user: { id: row.id, name: row.name, email: row.email, role: row.role } });
    })
  );

  router.get("/me", authenticate(db), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
