import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { openDatabase } from "../src/db";
import { createTestDb, futureIso, login, tempDbFile, workshopPayload } from "./helpers";

describe("capacity rule and registration history", () => {
  const db = createTestDb();
  const app = createApp(db);
  let manager: Record<string, string>;
  let staff: Record<string, string>;

  beforeAll(async () => {
    manager = { Authorization: `Bearer ${await login(app, "manager")}` };
    staff = { Authorization: `Bearer ${await login(app, "staff")}` };
  });

  async function newWorkshop(capacity: number) {
    const response = await request(app)
      .post("/api/workshops")
      .set(manager)
      .send(workshopPayload({ capacity }));
    return response.body.data.id as number;
  }

  const register = (id: number, n: number) =>
    request(app)
      .post(`/api/workshops/${id}/registrations`)
      .set(staff)
      .send({ attendeeName: `Person ${n}`, attendeeEmail: `person${n}@example.com` });

  it("never exceeds capacity under simultaneous requests", async () => {
    const id = await newWorkshop(5);
    const responses = await Promise.all(Array.from({ length: 40 }, (_, n) => register(id, n)));
    const created = responses.filter((r) => r.status === 201);
    const full = responses.filter((r) => r.status === 409 && r.body.error.code === "WORKSHOP_FULL");
    expect(created).toHaveLength(5);
    expect(full).toHaveLength(35);
    const detail = await request(app).get(`/api/workshops/${id}`).set(staff);
    expect(detail.body.data.activeCount).toBe(5);
    expect(detail.body.data.seatsAvailable).toBe(0);
  });

  it("holds across separate database connections to the same file", async () => {
    const file = tempDbFile();
    const first = createTestDb(file);
    const second = openDatabase(file);
    const appA = createApp(first);
    const appB = createApp(second);
    const headers = { Authorization: `Bearer ${await login(appA, "manager")}` };
    const created = await request(appA).post("/api/workshops").set(headers).send(workshopPayload({ capacity: 3 }));
    const id = created.body.data.id as number;
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, n) =>
        request(n % 2 === 0 ? appA : appB)
          .post(`/api/workshops/${id}/registrations`)
          .set(headers)
          .send({ attendeeName: `P${n}`, attendeeEmail: `p${n}@example.com` })
      )
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(3);
    const count = first
      .prepare("SELECT COUNT(*) AS c FROM registrations WHERE workshop_id = ? AND status = 'active'")
      .get(id) as { c: number };
    expect(count.c).toBe(3);
    first.close();
    second.close();
  });

  it("is enforced by the database even if the application is bypassed", async () => {
    const id = await newWorkshop(1);
    await register(id, 1);
    const insert = () =>
      db
        .prepare(
          "INSERT INTO registrations (workshop_id, attendee_name, attendee_email, registered_by) VALUES (?, 'Sneaky', 'sneaky@example.com', 3)"
        )
        .run(id);
    expect(insert).toThrow(/capacity_exceeded/);
  });

  it("frees the seat on cancel and keeps the record", async () => {
    const id = await newWorkshop(1);
    const first = await register(id, 100);
    expect((await register(id, 101)).status).toBe(409);
    const cancelled = await request(app)
      .post(`/api/registrations/${first.body.data.id}/cancel`)
      .set(staff)
      .send({ reason: "Sick" });
    expect(cancelled.body.data.cancelledAt).toBeTruthy();
    expect(cancelled.body.data.cancelReason).toBe("Sick");
    expect((await register(id, 101)).status).toBe(201);
    const history = await request(app).get(`/api/workshops/${id}/registrations`).set(staff);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data.map((r: { status: string }) => r.status).sort()).toEqual(["active", "cancelled"]);
    const again = await request(app).post(`/api/registrations/${first.body.data.id}/cancel`).set(staff).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_CANCELLED");
  });

  it("allows the same person to rejoin after cancelling but not to register twice", async () => {
    const id = await newWorkshop(3);
    const body = { attendeeName: "Repeat", attendeeEmail: "Repeat@Example.com" };
    const first = await request(app).post(`/api/workshops/${id}/registrations`).set(staff).send(body);
    expect(first.status).toBe(201);
    const duplicate = await request(app).post(`/api/workshops/${id}/registrations`).set(staff).send(body);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("ALREADY_REGISTERED");
    await request(app).post(`/api/registrations/${first.body.data.id}/cancel`).set(staff).send({});
    const rejoin = await request(app).post(`/api/workshops/${id}/registrations`).set(staff).send(body);
    expect(rejoin.status).toBe(201);
  });

  it("refuses to lower capacity below active registrations", async () => {
    const id = await newWorkshop(4);
    await Promise.all([register(id, 200), register(id, 201), register(id, 202)]);
    const tooLow = await request(app).patch(`/api/workshops/${id}`).set(manager).send({ capacity: 2 });
    expect(tooLow.status).toBe(409);
    expect(tooLow.body.error.code).toBe("CAPACITY_BELOW_REGISTRATIONS");
    const ok = await request(app).patch(`/api/workshops/${id}`).set(manager).send({ capacity: 3 });
    expect(ok.status).toBe(200);
  });

  it("never deletes or rewrites history at the database level", async () => {
    const id = await newWorkshop(2);
    const created = await register(id, 300);
    const regId = created.body.data.id;
    expect(() => db.prepare("DELETE FROM registrations WHERE id = ?").run(regId)).toThrow(/registrations_are_permanent/);
    expect(() => db.prepare("UPDATE registrations SET attendee_name = 'X' WHERE id = ?").run(regId)).toThrow(
      /history_is_immutable/
    );
    await request(app).post(`/api/registrations/${regId}/cancel`).set(staff).send({});
    expect(() => db.prepare("UPDATE registrations SET status = 'active' WHERE id = ?").run(regId)).toThrow();
  });

  it("refuses registration for closed or finished workshops", async () => {
    const cancelledId = await newWorkshop(5);
    await request(app).patch(`/api/workshops/${cancelledId}`).set(manager).send({ status: "cancelled" });
    const closed = await register(cancelledId, 400);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe("WORKSHOP_NOT_OPEN");
    const pastId = (
      await request(app)
        .post("/api/workshops")
        .set(manager)
        .send(workshopPayload({ startsAt: new Date(Date.now() - 5 * 86_400_000).toISOString() }))
    ).body.data.id;
    const ended = await register(pastId, 401);
    expect(ended.body.error.code).toBe("WORKSHOP_ENDED");
  });

  it("filters workshops by date range, status and seats available", async () => {
    const localDb = createTestDb();
    const localApp = createApp(localDb);
    const headers = { Authorization: `Bearer ${await login(localApp, "manager")}` };
    const make = async (code: string, startsAt: string, capacity: number) =>
      (await request(localApp).post("/api/workshops").set(headers).send(workshopPayload({ code, startsAt, capacity })))
        .body.data.id as number;
    const soon = await make("SOON", futureIso(1), 1);
    await make("LATER", futureIso(20), 5);
    await request(localApp)
      .post(`/api/workshops/${soon}/registrations`)
      .set(headers)
      .send({ attendeeName: "A", attendeeEmail: "a@example.com" });
    const list = async (query: string) =>
      (await request(localApp).get(`/api/workshops?${query}`).set(headers)).body.data.map((w: { code: string }) => w.code);
    expect(await list("hasSeats=true")).toEqual(["LATER"]);
    expect(await list(`from=${encodeURIComponent(futureIso(10))}`)).toEqual(["LATER"]);
    expect(await list(`to=${encodeURIComponent(futureIso(10))}`)).toEqual(["SOON"]);
    expect(await list("status=scheduled")).toEqual(["SOON", "LATER"]);
    expect(await list("q=lat")).toEqual(["LATER"]);
    expect(await list("status=cancelled")).toEqual([]);
  });
});
