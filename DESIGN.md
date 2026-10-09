# Design Document: Workshop Registration Service

## 1. Technology choices

| Choice | Reason |
| --- | --- |
| TypeScript, Node.js, Express | One language across API and UI, shared mental model, easy for reviewers to run |
| SQLite (better-sqlite3) | Real ACID transactions and triggers with no server to install. A good fit for three branches and about 15 staff |
| Zod | A single schema per endpoint gives validation and clean field-level errors |
| JWT and bcrypt | Simple stateless sessions with hashed passwords. No public signup exists |
| React and Vite | Quick, typed frontend with no heavy UI framework, keeping the interface simple for non-technical staff |
| Vitest and Supertest | Tests exercise the real HTTP app, including concurrency |

## 2. How over-registration is prevented

The rule is that active registrations never exceed capacity. It is protected in three layers:

1. **Transaction.** Registering runs in an immediate (write-locking) transaction that checks the workshop, counts active seats and inserts. Concurrent requests for the last seat are serialised, so the second one sees the seat taken and receives `409 WORKSHOP_FULL`.
2. **Database trigger.** A trigger rejects any insert that would exceed capacity, so a future bug or a manual SQL statement cannot break the rule.
3. **Capacity floor.** A second trigger and an API check stop a manager lowering capacity below the number of active registrations.

A partial unique index stops the same email being registered twice for one workshop while active, and allows rejoining after a cancellation.

**Evidence.** Tests send 40 parallel requests for 5 seats and expect exactly 5 successes. A second test races two separate database connections against one file. A third inserts directly with SQL and expects the trigger to refuse it.

## 3. Access control

A single permission matrix (`permissions.ts`) is enforced by middleware on every route, so hiding buttons is never the only protection. The user record is reloaded on each request, so role changes and deactivation apply immediately, even to tokens already issued. Admins cannot change their own role or deactivate themselves. Admins cannot view workshops, exactly as specified.

## 4. Registration history

Registrations are never deleted. Cancelling records status, who cancelled, when, and an optional reason. Database triggers forbid deleting a registration and editing a cancelled one. History is shown per workshop and can be filtered to registered or cancelled attendees.

## 5. Workshop catalogue and search

Beyond the client's list (code, title, instructor, date and time, capacity, status), I added room or branch, description and duration. Search supports date range, status, seats still available and free text, with pagination. The interface adds presets (today, next 7 days, next 30 days) and keeps filters in the URL so a view can be shared.

## 6. Bonus

An audit trail records workshop edits and account and role changes, with the actor, time and before and after values, readable by admins in the Change log. The waitlist was not built.

## 7. Trade-offs

- SQLite allows one writer at a time and one server process. That is enough here and keeps the guarantee simple. To scale out, move to PostgreSQL and lock the workshop row with `SELECT ... FOR UPDATE`. Only the service layer would change.
- Sessions use JWT held in `sessionStorage` for 8 hours, with login rate limiting. There are no refresh tokens, which keeps the system simple.
- Triggers duplicate checks that exist in code on purpose. The cost is a little redundancy, and the benefit is that the data stays valid whatever writes to it.

## 8. Assumptions

- Staff work in Sri Lanka time (UTC+05:30). Times are stored in UTC and shown in the browser's local time.
- Only admins read the audit trail, because the brief did not say who should.
- Workshop status is scheduled, cancelled or completed. Registration closes when a workshop is not scheduled or has ended, but late arrivals during a session can be added.
- Cancelling a workshop does not cancel registrations automatically, so staff can contact attendees first.
- Emails are matched case-insensitively. Attendees have no accounts.

## 9. Skipped

Waitlist, email or SMS notifications, password self-service, refresh tokens, frontend component tests and a hosted deployment.
