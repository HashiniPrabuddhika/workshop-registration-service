import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { Db, openDatabase } from "../src/db";

export const PASSWORDS = { admin: "Admin#12345", manager: "Manager#12345", staff: "Staff#12345" } as const;

export function createTestDb(file = ":memory:"): Db {
  const db = openDatabase(file);
  const insert = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  for (const role of ["admin", "manager", "staff"] as const) {
    insert.run(`Test ${role}`, `${role}@test.dev`, bcrypt.hashSync(PASSWORDS[role], 4), role);
  }
  return db;
}

export function tempDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "workshops-")), "test.db");
}

export async function login(app: ReturnType<typeof createApp>, role: keyof typeof PASSWORDS): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: `${role}@test.dev`, password: PASSWORDS[role] });
  return response.body.token as string;
}

export function futureIso(daysAhead = 3): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString();
}

export function workshopPayload(overrides: Record<string, unknown> = {}) {
  return {
    code: `W-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: "Test workshop",
    instructor: "Instructor",
    startsAt: futureIso(),
    capacity: 5,
    ...overrides
  };
}
