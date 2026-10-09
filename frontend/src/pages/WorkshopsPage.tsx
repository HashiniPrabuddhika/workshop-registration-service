import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNotice } from "../components/ErrorNotice";
import { Pagination } from "../components/Pagination";
import { SeatMeter } from "../components/SeatMeter";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { addDays, endOfDayIso, formatDate, formatRange, startOfDayIso, toDateInput } from "../format";
import { useDebounced, useFetch } from "../hooks";
import type { WorkshopStatus } from "../types";
import { WorkshopFormModal } from "./WorkshopFormModal";

const PAGE_SIZE = 20;

export function WorkshopsPage() {
  const { can } = useAuth();
  const notify = useToast();
  const [params, setParams] = useSearchParams();
  const today = toDateInput(new Date());
  const from = params.has("from") ? (params.get("from") as string) : today;
  const to = params.get("to") ?? "";
  const status = (params.get("status") ?? "") as WorkshopStatus | "";
  const hasSeats = params.get("hasSeats") === "true";
  const page = Math.max(Number(params.get("page") ?? 1) || 1, 1);
  const urlQuery = params.get("q") ?? "";
  const [search, setSearch] = useState(urlQuery);
  const debouncedSearch = useDebounced(search);
  const [creating, setCreating] = useState(false);

  const update = (patch: Record<string, string | undefined>, keepPage = false) => {
    const next = new URLSearchParams(params);
    if (!keepPage) {
      next.delete("page");
    }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    setSearch(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (debouncedSearch !== urlQuery) {
      update({ q: debouncedSearch || undefined });
    }
  }, [debouncedSearch]);

  const query = useMemo(
    () => ({
      from: from ? startOfDayIso(from) : undefined,
      to: to ? endOfDayIso(to) : undefined,
      status,
      hasSeats,
      q: urlQuery || undefined,
      page,
      pageSize: PAGE_SIZE
    }),
    [from, to, status, hasSeats, urlQuery, page]
  );

  const { data, error, loading, reload } = useFetch(() => api.listWorkshops(query), [query]);

  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Next 7 days", from: today, to: toDateInput(addDays(new Date(), 7)) },
    { label: "Next 30 days", from: today, to: toDateInput(addDays(new Date(), 30)) },
    { label: "Any date", from: "", to: "" }
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Workshops</h1>
          <p className="muted">{data ? `${data.meta.total} found` : "Loading workshops"}</p>
        </div>
        {can("manager") ? (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            Add workshop
          </button>
        ) : null}
      </div>

      <section className="filters" aria-label="Find workshops">
        <div className="chips" role="group" aria-label="Quick dates">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={from === preset.from && to === preset.to ? "chip chip-on" : "chip"}
              onClick={() => update({ from: preset.from, to: preset.to })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={hasSeats}
            onChange={(event) => update({ hasSeats: event.target.checked ? "true" : undefined })}
          />
          <span>Only with seats left</span>
        </label>
        <div className="filter-grid">
          <label className="field">
            <span>From</span>
            <input type="date" value={from} onChange={(event) => update({ from: event.target.value })} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(event) => update({ to: event.target.value })} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => update({ status: event.target.value || undefined })}>
              <option value="">Any status</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="field">
            <span>Search</span>
            <input
              type="search"
              value={search}
              placeholder="Title, code or instructor"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </section>

      {error ? <ErrorNotice error={error} onRetry={reload} /> : null}

      {data && data.data.length === 0 && !loading ? (
        <div className="empty">
          <h2>No workshops match</h2>
          <p>Widen the dates or clear the seat filter to see more.</p>
          <button type="button" className="btn" onClick={() => update({ from: "", to: "", status: undefined, hasSeats: undefined, q: undefined })}>
            Clear filters
          </button>
        </div>
      ) : null}

      <ul className={loading && data ? "workshop-list is-loading" : "workshop-list"}>
        {data?.data.map((workshop) => (
          <li key={workshop.id}>
            <Link to={`/workshops/${workshop.id}`} className="workshop-row">
              <div className="when">
                <strong>{formatDate(workshop.startsAt)}</strong>
                <span>{formatRange(workshop.startsAt, workshop.durationMinutes)}</span>
              </div>
              <div className="what">
                <strong>{workshop.title}</strong>
                <span>
                  {workshop.code}, {workshop.instructor}
                  {workshop.location ? `, ${workshop.location}` : ""}
                </span>
              </div>
              <SeatMeter
                capacity={workshop.capacity}
                taken={workshop.activeCount}
                closed={workshop.status !== "scheduled"}
              />
              <div className="state">
                <StatusBadge status={workshop.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {data ? (
        <Pagination
          page={data.meta.page}
          pageSize={data.meta.pageSize}
          total={data.meta.total}
          onChange={(next) => update({ page: String(next) }, true)}
        />
      ) : null}

      {creating ? (
        <WorkshopFormModal
          onClose={() => setCreating(false)}
          onSaved={(workshop) => {
            setCreating(false);
            notify(`Added ${workshop.title}`);
            reload();
          }}
        />
      ) : null}
    </>
  );
}
