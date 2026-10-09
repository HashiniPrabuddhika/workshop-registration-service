import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { ErrorNotice, fieldErrors } from "../components/ErrorNotice";
import { Modal } from "../components/Modal";
import { SeatMeter } from "../components/SeatMeter";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { formatDate, formatRange, formatStamp } from "../format";
import { useFetch } from "../hooks";
import type { Registration } from "../types";
import { WorkshopFormModal } from "./WorkshopFormModal";

type Filter = "all" | "active" | "cancelled";

export function WorkshopDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const notify = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState<Registration | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<ApiError | null>(null);

  const workshop = useFetch(() => api.getWorkshop(id), [id]);
  const registrations = useFetch(
    () => api.listRegistrations(id, filter === "all" ? undefined : filter),
    [id, filter]
  );

  const refresh = () => {
    workshop.reload();
    registrations.reload();
  };

  if (workshop.error) {
    return (
      <>
        <Link to="/workshops" className="back">
          Back to workshops
        </Link>
        <ErrorNotice error={workshop.error} onRetry={workshop.reload} />
      </>
    );
  }
  if (!workshop.data) {
    return <p className="page-status">Loading</p>;
  }

  const item = workshop.data.data;
  const open = item.status === "scheduled";
  const full = item.seatsAvailable === 0;
  const errors = fieldErrors(formError);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const result = await api.register(id, name, email);
      notify(`${result.data.attendeeName} is registered`);
      setName("");
      setEmail("");
      refresh();
    } catch (reason) {
      const error = reason instanceof ApiError ? reason : new ApiError(0, "UNKNOWN", "Something went wrong");
      setFormError(error);
      if (error.code === "WORKSHOP_FULL") {
        refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/workshops" className="back">
        Back to workshops
      </Link>

      <section className="detail-head">
        <div>
          <h1>{item.title}</h1>
          <p className="muted">
            {item.code}, with {item.instructor}
            {item.location ? `, ${item.location}` : ""}
          </p>
          <p>
            {formatDate(item.startsAt)}, {formatRange(item.startsAt, item.durationMinutes)}
          </p>
          {item.description ? <p className="description">{item.description}</p> : null}
        </div>
        <div className="detail-side">
          <StatusBadge status={item.status} />
          <SeatMeter capacity={item.capacity} taken={item.activeCount} closed={!open} />
          {can("manager") ? (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Edit workshop
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Register an attendee</h2>
        {!open ? (
          <p className="muted">Registration is closed because this workshop is {item.status}.</p>
        ) : full ? (
          <p className="muted">This workshop is full. Cancel a registration below to free a seat.</p>
        ) : (
          <form className="inline-form" onSubmit={submit} noValidate>
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
              {errors.attendeeName ? <em className="field-error">{errors.attendeeName}</em> : null}
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              {errors.attendeeEmail ? <em className="field-error">{errors.attendeeEmail}</em> : null}
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !email.trim()}>
              {busy ? "Registering" : "Register attendee"}
            </button>
          </form>
        )}
        {formError && Object.keys(errors).length === 0 ? <ErrorNotice error={formError} /> : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Registrations and history</h2>
          <div className="chips" role="group" aria-label="Filter registrations">
            {(["all", "active", "cancelled"] as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "chip chip-on" : "chip"}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "Everyone" : value === "active" ? "Registered" : "Cancelled"}
              </button>
            ))}
          </div>
        </div>
        {registrations.error ? <ErrorNotice error={registrations.error} onRetry={registrations.reload} /> : null}
        {registrations.data && registrations.data.data.length === 0 ? (
          <p className="muted">No registrations here yet.</p>
        ) : null}
        {registrations.data && registrations.data.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Attendee</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th>Cancelled</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {registrations.data.data.map((registration) => (
                  <tr key={registration.id} className={registration.status === "cancelled" ? "row-muted" : undefined}>
                    <td>
                      <strong>{registration.attendeeName}</strong>
                      <span className="sub">{registration.attendeeEmail}</span>
                    </td>
                    <td>
                      <StatusBadge status={registration.status} />
                    </td>
                    <td>
                      {formatStamp(registration.registeredAt)}
                      <span className="sub">by {registration.registeredBy.name}</span>
                    </td>
                    <td>
                      {registration.cancelledAt && registration.cancelledBy ? (
                        <>
                          {formatStamp(registration.cancelledAt)}
                          <span className="sub">by {registration.cancelledBy.name}</span>
                          {registration.cancelReason ? <span className="sub">{registration.cancelReason}</span> : null}
                        </>
                      ) : (
                        <span className="sub">Not cancelled</span>
                      )}
                    </td>
                    <td className="right">
                      {registration.status === "active" ? (
                        <button type="button" className="btn btn-danger-quiet" onClick={() => setCancelling(registration)}>
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {cancelling ? (
        <CancelDialog
          registration={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            notify(`Cancelled ${cancelling.attendeeName}. One seat is free`);
            setCancelling(null);
            refresh();
          }}
          onStale={() => {
            setCancelling(null);
            refresh();
          }}
        />
      ) : null}

      {editing ? (
        <WorkshopFormModal
          workshop={item}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            notify("Workshop updated");
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

interface CancelDialogProps {
  registration: Registration;
  onClose: () => void;
  onDone: () => void;
  onStale: () => void;
}

function CancelDialog({ registration, onClose, onDone, onStale }: CancelDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.cancelRegistration(registration.id, reason);
      onDone();
    } catch (reasonError) {
      const apiError = reasonError instanceof ApiError ? reasonError : new ApiError(0, "UNKNOWN", "Something went wrong");
      if (apiError.code === "ALREADY_CANCELLED") {
        onStale();
        return;
      }
      setError(apiError);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Cancel ${registration.attendeeName}?`} onClose={onClose}>
      <p>
        The seat is freed straight away. The registration stays in the history with your name and the time.
      </p>
      <label className="field">
        <span>Reason (optional)</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
      </label>
      {error ? <ErrorNotice error={error} /> : null}
      <div className="actions">
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Keep registration
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={confirm}>
          {busy ? "Cancelling" : "Cancel registration"}
        </button>
      </div>
    </Modal>
  );
}
