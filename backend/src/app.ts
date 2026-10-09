import cors from "cors";
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { Db } from "./db";
import { authenticate } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { auditRouter } from "./routes/audit";
import { authRouter } from "./routes/auth";
import { registrationsRouter } from "./routes/registrations";
import { usersRouter } from "./routes/users";
import { workshopsRouter } from "./routes/workshops";

export function createApp(db: Db) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "100kb" }));

  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  api.use("/auth", authRouter(db));
  api.use(authenticate(db));
  api.use("/users", usersRouter(db));
  api.use("/workshops", workshopsRouter(db));
  api.use("/registrations", registrationsRouter(db));
  api.use("/audit", auditRouter(db));
  api.use(notFoundHandler);
  app.use("/api", api);

  const indexFile = path.join(config.frontendDist, "index.html");
  if (config.nodeEnv !== "test" && fs.existsSync(indexFile)) {
    app.use(express.static(config.frontendDist));
    app.get("*", (_req, res) => {
      res.sendFile(indexFile);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
