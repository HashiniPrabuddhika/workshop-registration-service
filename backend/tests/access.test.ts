import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createTestDb, login, workshopPayload } from "./helpers";

describe("access control", () => {
  const db = createTestDb();
  const app = createApp(db);
  const tokens = {} as Record<"admin" | "manager" | "staff", string>;
  let workshopId: number;
  let registrationId: number;

  beforeAll(async () => {
    tokens.admin = await login(app, "admin");
    tokens.manager = await login(app, "manager");
    tokens.staff = await login(app, "staff");
    const created = await request(app)
      .post("/api/workshops")
      .set("Authorization", `Bearer ${tokens.manager}`)
      .send(workshopPayload());
    workshopId = created.body.data.id;
    const registered = await request(app)
      .post(`/api/workshops/${workshopId}/registrations`)
      .set("Authorization", `Bearer ${tokens.staff}`)
      .send({ attendeeName: "Pat", attendeeEmail: "pat@example.com" });
    registrationId = registered.body.data.id;
  });

  const as = (role: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[role]}` });

  it("rejects requests without a valid token", async () => {
    expect((await request(app).get("/api/workshops")).status).toBe(401);
    expect((await request(app).get("/api/workshops").set("Authorization", "Bearer nope")).status).toBe(401);
  });

  it("rejects wrong credentials with a generic error", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: "admin@test.dev", password: "wrong" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("lets only admins manage users", async () => {
    const payload = { name: "New", email: "new@test.dev", password: "Password123", role: "staff" };
    for (const role of ["manager", "staff"] as const) {
      expect((await request(app).get("/api/users").set(as(role))).status).toBe(403);
      expect((await request(app).post("/api/users").set(as(role)).send(payload)).status).toBe(403);
      expect((await request(app).patch("/api/users/1").set(as(role)).send({ name: "x" })).status).toBe(403);
    }
    const created = await request(app).post("/api/users").set(as("admin")).send(payload);
    expect(created.status).toBe(201);
    expect(created.body.data).not.toHaveProperty("password_hash");
  });

  it("blocks admins from workshops and registrations", async () => {
    expect((await request(app).get("/api/workshops").set(as("admin"))).status).toBe(403);
    expect((await request(app).get(`/api/workshops/${workshopId}`).set(as("admin"))).status).toBe(403);
    expect((await request(app).post("/api/workshops").set(as("admin")).send(workshopPayload())).status).toBe(403);
    expect((await request(app).get("/api/registrations").set(as("admin"))).status).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/workshops/${workshopId}/registrations`)
          .set(as("admin"))
          .send({ attendeeName: "A", attendeeEmail: "a@example.com" })
      ).status
    ).toBe(403);
  });

  it("lets only managers write workshops", async () => {
    expect((await request(app).post("/api/workshops").set(as("staff")).send(workshopPayload())).status).toBe(403);
    expect(
      (await request(app).patch(`/api/workshops/${workshopId}`).set(as("staff")).send({ title: "Hacked" })).status
    ).toBe(403);
    const updated = await request(app)
      .patch(`/api/workshops/${workshopId}`)
      .set(as("manager"))
      .send({ title: "Renamed" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe("Renamed");
  });

  it("lets managers and staff view and register, but not admins", async () => {
    for (const role of ["manager", "staff"] as const) {
      expect((await request(app).get("/api/workshops").set(as(role))).status).toBe(200);
      expect((await request(app).get(`/api/workshops/${workshopId}/registrations`).set(as(role))).status).toBe(200);
    }
    expect((await request(app).get("/api/audit").set(as("manager"))).status).toBe(403);
    expect((await request(app).get("/api/audit").set(as("staff"))).status).toBe(403);
    expect((await request(app).get("/api/audit").set(as("admin"))).status).toBe(200);
  });

  it("only allows registration cancellation for managers and staff", async () => {
    expect((await request(app).post(`/api/registrations/${registrationId}/cancel`).set(as("admin"))).status).toBe(403);
    const cancelled = await request(app)
      .post(`/api/registrations/${registrationId}/cancel`)
      .set(as("staff"))
      .send({ reason: "Changed mind" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("cancelled");
    expect(cancelled.body.data.cancelledBy.name).toBe("Test staff");
  });

  it("applies role changes and deactivation immediately", async () => {
    const created = await request(app)
      .post("/api/users")
      .set(as("admin"))
      .send({ name: "Temp", email: "temp@test.dev", password: "Password123", role: "staff" });
    const loggedIn = await request(app).post("/api/auth/login").send({ email: "temp@test.dev", password: "Password123" });
    const tempAuth = { Authorization: `Bearer ${loggedIn.body.token}` };
    expect((await request(app).get("/api/workshops").set(tempAuth)).status).toBe(200);
    await request(app).patch(`/api/users/${created.body.data.id}`).set(as("admin")).send({ role: "admin" });
    expect((await request(app).get("/api/workshops").set(tempAuth)).status).toBe(403);
    await request(app).patch(`/api/users/${created.body.data.id}`).set(as("admin")).send({ isActive: false });
    expect((await request(app).get("/api/workshops").set(tempAuth)).status).toBe(401);
    const relogin = await request(app).post("/api/auth/login").send({ email: "temp@test.dev", password: "Password123" });
    expect(relogin.status).toBe(401);
  });

  it("protects against self-modification and lets a second admin take over", async () => {
    const self = await request(app).patch("/api/users/1").set(as("admin")).send({ role: "manager" });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("CANNOT_MODIFY_SELF");
    await request(app)
      .post("/api/users")
      .set(as("admin"))
      .send({ name: "Second", email: "second@test.dev", password: "Password123", role: "admin" });
    const secondLogin = await request(app).post("/api/auth/login").send({ email: "second@test.dev", password: "Password123" });
    const deactivateFirst = await request(app)
      .patch("/api/users/1")
      .set({ Authorization: `Bearer ${secondLogin.body.token}` })
      .send({ isActive: false });
    expect(deactivateFirst.status).toBe(200);
    expect((await request(app).get("/api/users").set(as("admin"))).status).toBe(401);
  });

  it("records an audit trail for workshop and account changes", async () => {
    const secondLogin = await request(app).post("/api/auth/login").send({ email: "second@test.dev", password: "Password123" });
    const audit = await request(app)
      .get("/api/audit")
      .set({ Authorization: `Bearer ${secondLogin.body.token}` });
    expect(audit.status).toBe(200);
    const actions = audit.body.data.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["workshop.created", "workshop.updated", "user.created", "user.updated"]));
  });

  it("validates input", async () => {
    const response = await request(app)
      .post("/api/workshops")
      .set(as("manager"))
      .send({ code: "x", title: "", capacity: 0 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
