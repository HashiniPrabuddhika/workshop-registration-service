import bcrypt from "bcryptjs";
import { config } from "./config";
import { Db, openDatabase } from "./db";

export const DEMO_ACCOUNTS = [
  { name: "Nimali Perera", email: "admin@centre.test", password: "Admin#12345", role: "admin" },
  { name: "Kasun Fernando", email: "manager@centre.test", password: "Manager#12345", role: "manager" },
  { name: "Dilani Jayasinghe", email: "staff@centre.test", password: "Staff#12345", role: "staff" }
] as const;

function at(daysFromNow: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function seedAdminOnly(db: Db): void {
  const admin = DEMO_ACCOUNTS[0];
  db.prepare("INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)").run(
    admin.name,
    admin.email,
    bcrypt.hashSync(admin.password, 10),
    admin.role,
    new Date().toISOString()
  );
}

export function seedDemoData(db: Db): void {
  const run = db.transaction(() => {
    const insertUser = db.prepare(
      "INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    const ids: Record<string, number> = {};
    for (const account of DEMO_ACCOUNTS) {
      const result = insertUser.run(
        account.name,
        account.email,
        bcrypt.hashSync(account.password, 10),
        account.role,
        new Date().toISOString()
      );
      ids[account.role] = Number(result.lastInsertRowid);
    }

    const insertWorkshop = db.prepare(
      `INSERT INTO workshops
         (code, title, instructor, description, location, starts_at, duration_minutes, capacity, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    const workshops = [
      ["POT-101", "Wheel throwing for beginners", "Sanduni Weerasinghe", "Centre a lump of clay and pull your first bowl. Aprons provided.", "Colombo 07 - Studio A", at(1, 10), 180, 12, "scheduled"],
      ["COD-201", "Introduction to web development", "Tharindu Wickramasinghe", "HTML, CSS and a first interactive page. Bring a laptop.", "Colombo 07 - Computer Lab 2", at(2, 18), 120, 20, "scheduled"],
      ["FIT-110", "Saturday morning strength circuit", "Ishara Gunawardena", "Full-body circuit using bodyweight and kettlebells.", "Kandy - Fitness Hall", at(3, 7, 30), 60, 15, "scheduled"],
      ["BAT-120", "Batik painting basics", "Anjali Ratnayake", "Wax resist, dyeing and fixing on cotton. Materials included.", "Galle - Craft Room", at(4, 14), 150, 8, "scheduled"],
      ["COO-130", "Traditional Sri Lankan cooking: string hoppers and sambols", "Kavitha Sivakumar", "Hands-on class covering string hoppers, pol sambol and a dhal curry.", "Colombo 07 - Kitchen", at(5, 11), 120, 5, "scheduled"],
      ["COD-301", "Python for data analysis", "Ruwan Senanayake", "Clean and chart a real dataset with pandas.", "Kandy - Computer Lab", at(9, 17, 30), 180, 18, "scheduled"],
      ["YOG-090", "Morning yoga and mobility", "Hiruni Abeysekera", "Gentle session for all levels.", "Galle - Fitness Hall", at(-6, 6, 30), 60, 15, "completed"],
      ["WEA-140", "Handloom weaving introduction", "Chamara Dissanayake", "Warping a loom and weaving a simple table runner.", "Kandy - Craft Room", at(6, 15), 180, 10, "cancelled"]
    ];
    const workshopIds: Record<string, number> = {};
    for (const w of workshops) {
      const result = insertWorkshop.run(...w, ids.manager, now, now);
      workshopIds[w[0] as string] = Number(result.lastInsertRowid);
    }

    const insertRegistration = db.prepare(
      `INSERT INTO registrations
         (workshop_id, attendee_name, attendee_email, status, registered_by, registered_at, cancelled_by, cancelled_at, cancel_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const names = [
      "Amaya Silva", "Mohamed Fazil", "Kavindi Herath", "Suresh Kumar", "Nadeesha Kariyawasam",
      "Farhana Rizvi", "Thilini Madushani", "Lakmal Bandara", "Priyanka Selvarajah", "Ashan Jayawardena",
      "Yasmin Hameed", "Roshan Cooray", "Mathangi Nadarajah", "Dhanushka Liyanage", "Imran Nazeer"
    ];
    const emailOf = (name: string) => `${name.toLowerCase().replace(/ /g, ".")}@example.com`;
    const fill = (code: string, count: number, offset = 0) => {
      for (let i = 0; i < count; i += 1) {
        const name = names[(i + offset) % names.length];
        insertRegistration.run(
          workshopIds[code], name, emailOf(name), "active", ids.staff, at(-2, 9 + (i % 8)), null, null, null
        );
      }
    };
    fill("FIT-110", 14);
    fill("COO-130", 5);
    fill("POT-101", 6, 3);
    fill("COD-201", 9, 5);
    fill("BAT-120", 3, 8);
    insertRegistration.run(
      workshopIds["COO-130"], "Sahan Rodrigo", "sahan.rodrigo@example.com", "cancelled",
      ids.staff, at(-3, 10), ids.manager, at(-1, 15), "Schedule clash"
    );
  });
  run();
}

export function seedIfEmpty(db: Db): boolean {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  if (count > 0) {
    return false;
  }
  if (config.seedDemo) {
    seedDemoData(db);
  } else {
    seedAdminOnly(db);
  }
  return true;
}

if (require.main === module) {
  const db = openDatabase(config.dbPath);
  const seeded = seedIfEmpty(db);
  console.log(seeded ? "Seeded demo data" : "Database already has users, nothing seeded");
  db.close();
}
