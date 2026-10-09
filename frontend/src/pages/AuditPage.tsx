import { useState } from "react";
import { api } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { Pagination } from "../components/Pagination";
import { formatStamp } from "../format";
import { useFetch } from "../hooks";
import type { AuditEntry } from "../types";

const ACTION_LABELS: Record<string, string> = {
  "user.created": "Created account",
  "user.updated": "Updated account",
  "workshop.created": "Added workshop",
  "workshop.updated": "Edited workshop"
};

const FIELD_LABELS: Record<string, string> = {
  startsAt: "start time",
  durationMinutes: "length",
  isActive: "active",
  description: "description",
  location: "room"
};

function show(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatStamp(value);
  }
  if (typeof value === "string") {
    return value.length > 40 ? `${value.slice(0, 40)}...` : value || "empty";
  }
  return String(value);
}

function summarize(entry: AuditEntry): string[] {
  const details = entry.details as {
    code?: string;
    email?: string;
    title?: string;
    role?: string;
    passwordReset?: boolean;
    changes?: Record<string, { from: unknown; to: unknown }>;
  };
  const subject = details.code ?? details.email ?? `#${entry.entityId}`;
  const lines: string[] = [];
  if (entry.action.endsWith(".created")) {
    lines.push(`${subject}${details.role ? ` as ${details.role}` : ""}${details.title ? `, ${details.title}` : ""}`);
  } else {
    lines.push(subject);
    for (const [field, change] of Object.entries(details.changes ?? {})) {
      lines.push(`${FIELD_LABELS[field] ?? field}: ${show(change.from)} to ${show(change.to)}`);
    }
    if (details.passwordReset) {
      lines.push("password was reset");
    }
  }
  return lines;
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<"" | "user" | "workshop">("");
  const { data, error, reload } = useFetch(() => api.listAudit(page, type || undefined), [page, type]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Change log</h1>
          <p className="muted">Who changed accounts and workshops, and when.</p>
        </div>
        <label className="field compact">
          <span>Show</span>
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as "" | "user" | "workshop");
              setPage(1);
            }}
          >
            <option value="">Everything</option>
            <option value="user">Accounts</option>
            <option value="workshop">Workshops</option>
          </select>
        </label>
      </div>

      {error ? <ErrorNotice error={error} onRetry={reload} /> : null}
      {data && data.data.length === 0 ? <p className="muted">Nothing has changed yet.</p> : null}

      {data && data.data.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatStamp(entry.createdAt)}</td>
                  <td>{entry.actor.name}</td>
                  <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                  <td>
                    {summarize(entry).map((line, index) => (
                      <span key={index} className={index === 0 ? "" : "sub"}>
                        {line}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data ? (
        <Pagination page={data.meta.page} pageSize={data.meta.pageSize} total={data.meta.total} onChange={setPage} />
      ) : null}
    </>
  );
}
