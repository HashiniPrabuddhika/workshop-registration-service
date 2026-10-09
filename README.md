# Workshop Registration Service

Full-stack workshop registration system with role-based access (Admin / Manager / Staff), race-safe seat capacity enforcement, permanent registration history and workshop search by date, status and availability.

**Stack:** React · Vite · TypeScript · Node.js · Express · SQLite · Zod · JWT
**Bonus delivered:** Audit trail.

A full stack web application for a community training centre with branches in Colombo, Kandy and Galle. Front desk staff register attendees for workshops with limited seats, programme managers schedule workshops, and administrators manage staff accounts. The system guarantees that a workshop is never overbooked, even when several staff register people for the same workshop at the same moment.

## Highlights

- **Role-based access** for Admin, Manager and Front desk staff, enforced by the backend on every route.
- **Overbooking is impossible.** Seat checks run inside a database transaction, with a database trigger as a second safeguard.
- **Permanent registration history.** Cancelling frees the seat but never deletes the record. Who registered or cancelled, when, and why are always kept.
- **Quick workshop search** by date range, status and seats still available, with one-click presets such as "Next 7 days".
- **Audit trail (bonus)** of workshop edits and account and role changes.
- **Tested.** 20 automated tests, including 40 simultaneous registrations competing for 5 seats.

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | Node.js, Express, TypeScript | One language across the stack, strong typing, simple to run |
| Database | SQLite (better-sqlite3) | Real transactions and triggers, zero setup, free |
| Validation | Zod | One schema validates every request body and query |
| Auth | JWT and bcrypt | Stateless sessions, hashed passwords |
| Frontend | React, Vite, TypeScript | Fast development, typed API layer |
| Tests | Vitest and Supertest | Fast API-level tests that hit the real app |

## Getting started

Requirements: Node.js 20 or newer (22 LTS recommended) and npm.

```bash
git clone https://github.com/HashiniPrabuddhika/workshop-registration-service.git
cd workshop-registration-service
npm install
npm run dev
```

Run `npm install` once, in the project root. The project uses npm workspaces, so this installs both backend and frontend.

- Web app: http://localhost:5173
- API: http://localhost:4000 (health check at `/api/health`)

On the first start with an empty database, demo accounts and sample workshops are created automatically. You can also run `npm run seed`.

### Demo accounts (development only)

| Role | Name | Email | Password |
| --- | --- | --- | --- |
| Admin | Nimali Perera | admin@centre.test | Admin#12345 |
| Manager | Kasun Fernando | manager@centre.test | Manager#12345 |
| Front desk | Dilani Jayasinghe | staff@centre.test | Staff#12345 |

These credentials are for local development only. There is no public signup: the first Admin is seeded and Admins create every other account.

### Sample data

Eight workshops across the three branches, with dates relative to today so the "Next 7 days" filter always has results: pottery, web development, strength training, batik painting, Sri Lankan cooking (full, 5 of 5 seats), Python, a completed yoga class and a cancelled weaving class. One workshop has a cancelled registration so you can see the history straight away.

### Suggested walkthrough

1. Sign in as **staff**, open "Saturday morning strength circuit" (1 seat left) and register someone. The workshop becomes full and registration is disabled.
2. Cancel a registration, add a reason, and see the seat reopen while the record stays in the history table.
3. Sign in as **manager**, add and edit a workshop. Try lowering capacity below the registered count and read the error.
4. Sign in as **admin**, create an account, change a role, then open the Change log. Note that admins cannot see workshops, exactly as specified.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts API and web app with hot reload |
| `npm test` | Runs the backend test suite |
| `npm run build` | Type-checks and builds both apps |
| `npm start` | Runs the built API, which also serves the built web app |
| `npm run seed` | Seeds demo data into an empty database |

### Production style run

```bash
npm run build
JWT_SECRET=<long-random-value> npm start
```

On Windows PowerShell:

```powershell
npm run build
$env:JWT_SECRET="<long-random-value>"; npm start
```

Everything is then served from http://localhost:4000. In production, demo seeding is disabled and `JWT_SECRET` is required. With demo seeding off, an empty database is seeded with the Admin account only.

## Configuration

Copy `backend/.env.example` to `backend/.env` if you want to override the defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 4000 | API port |
| `JWT_SECRET` | development value | Signing key. Required in production |
| `DB_PATH` | `backend/data/workshops.db` | SQLite file location |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin |
| `SEED_DEMO` | `true` | Seed demo data into an empty database (ignored in production) |

## Permissions

| Action | Admin | Manager | Staff |
| --- | :---: | :---: | :---: |
| Create user accounts and set roles | Yes | No | No |
| Add and edit workshops | No | Yes | No |
| Register and cancel attendees | No | Yes | Yes |
| View workshops, registrations and history | No | Yes | Yes |
| View the audit trail | Yes | No | No |

Everything not marked is refused with `403` by the backend, not just hidden in the interface. The tests verify each cell of this table.

## How overbooking is prevented

1. **Transaction.** Registering runs in an immediate (write-locking) transaction that checks the workshop, counts active seats and inserts. Concurrent requests for the last seat are serialised, so the second one receives `409 WORKSHOP_FULL`.
2. **Database trigger.** A trigger rejects any insert that would exceed capacity, so a future bug or a manual SQL statement cannot break the rule.
3. **Capacity floor.** A second trigger and an API check stop a manager lowering capacity below the number of active registrations.

A partial unique index prevents the same email being registered twice for one workshop while active, and allows re-registering after a cancellation. Full reasoning is in [DESIGN.md](DESIGN.md).

## API overview

All routes except login require `Authorization: Bearer <token>`. Errors use one shape: `{ "error": { "code", "message", "details?" } }`.

| Method and path | Roles |
| --- | --- |
| `POST /api/auth/login`, `GET /api/auth/me` | any |
| `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id` | admin |
| `GET /api/audit` | admin |
| `GET /api/workshops` with `from`, `to`, `status`, `hasSeats`, `q`, `page`, `pageSize` | manager, staff |
| `GET /api/workshops/:id` | manager, staff |
| `POST /api/workshops`, `PATCH /api/workshops/:id` | manager |
| `GET /api/workshops/:id/registrations` | manager, staff |
| `POST /api/workshops/:id/registrations` | manager, staff |
| `GET /api/registrations` with `workshopId`, `status`, `email` | manager, staff |
| `POST /api/registrations/:id/cancel` | manager, staff |

Notable status codes: `409 WORKSHOP_FULL`, `409 ALREADY_REGISTERED`, `409 ALREADY_CANCELLED`, `409 CAPACITY_BELOW_REGISTRATIONS`, `400 VALIDATION_ERROR`, `401`, `403`.


## Known limitations

- Waitlist (bonus) was not implemented.
- No email or SMS notifications, password reset or refresh tokens.
- SQLite supports a single server process. To scale out, move to PostgreSQL and use `SELECT ... FOR UPDATE` on the workshop row (details in DESIGN.md).
- No frontend component tests. The backend has 20 automated tests covering access control and concurrent registration.
- No hosted deployment. Run locally with the steps above.

## Troubleshooting

- **`better-sqlite3` fails to install on Windows:** use Node 20 or newer with this repository's lockfile. The pinned version ships prebuilt binaries for Node 20, 22 and 24, so Visual Studio is not needed. If you see a compile error, delete `node_modules` and `package-lock.json` in the project root and run `npm install` again.
- **Port already in use:** set `PORT` for the API, or stop the other process.
- **Reset demo data:** stop the server, delete `backend/data`, start again.

