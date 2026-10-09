import path from "node:path";

const nodeEnv = process.env.NODE_ENV ?? "development";

if (nodeEnv === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

export const config = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret-change-me",
  jwtExpiresIn: "8h",
  dbPath: process.env.DB_PATH ?? path.join(process.cwd(), "data", "workshops.db"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  seedDemo: process.env.SEED_DEMO !== "false" && nodeEnv !== "production",
  frontendDist: process.env.FRONTEND_DIST ?? path.join(process.cwd(), "..", "frontend", "dist")
};
