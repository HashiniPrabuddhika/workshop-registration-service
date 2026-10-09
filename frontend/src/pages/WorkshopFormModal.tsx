import { FormEvent, useState } from "react";
import { ApiError, api } from "../api";
import { ErrorNotice, fieldErrors } from "../components/ErrorNotice";
import { Modal } from "../components/Modal";
import { toDateTimeInput } from "../format";
import type { Workshop, WorkshopStatus } from "../types";

interface Props {
  workshop?: Workshop;
  onClose: () => void;
  onSaved: (workshop: Workshop) => void;
}

function defaultStart() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(10, 0, 0, 0);
  return toDateTimeInput(date.toISOString());
}

export function WorkshopFormModal({ workshop, onClose, onSaved }: Props) {
  const [code, setCode] = useState(workshop?.code ?? "");
  const [title, setTitle] = useState(workshop?.title ?? "");
  const [instructor, setInstructor] = useState(workshop?.instructor ?? "");
  const [location, setLocation] = useState(workshop?.location ?? "");
  const [description, setDescription] = useState(workshop?.description ?? "");
  const [startsAt, setStartsAt] = useState(workshop ? toDateTimeInput(workshop.startsAt) : defaultStart());
  const [duration, setDuration] = useState(String(workshop?.durationMinutes ?? 120));
  const [capacity, setCapacity] = useState(String(workshop?.capacity ?? 12));
  const [status, setStatus] = useState<WorkshopStatus>(workshop?.status ?? "scheduled");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const errors = fieldErrors(error);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input = {
      code,
      title,
      instructor,
      location,
      description,
      startsAt: startsAt ? new Date(startsAt).toISOString() : "",
      durationMinutes: Number(duration),
      capacity: Number(capacity)
    };
    try {
      const result = workshop
        ? await api.updateWorkshop(workshop.id, { ...input, status })
        : await api.createWorkshop(input);
      onSaved(result.data);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason : new ApiError(0, "UNKNOWN", "Something went wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={workshop ? "Edit workshop" : "Add workshop"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="form-grid">
        {error && Object.keys(errors).length === 0 ? <ErrorNotice error={error} /> : null}
        <label className="field">
          <span>Code</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="POT-103" required />
          {errors.code ? <em className="field-error">{errors.code}</em> : null}
        </label>
        <label className="field">
          <span>Capacity</span>
          <input type="number" min={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} required />
          {errors.capacity ? <em className="field-error">{errors.capacity}</em> : null}
        </label>
        <label className="field span-2">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          {errors.title ? <em className="field-error">{errors.title}</em> : null}
        </label>
        <label className="field">
          <span>Instructor</span>
          <input value={instructor} onChange={(event) => setInstructor(event.target.value)} required />
          {errors.instructor ? <em className="field-error">{errors.instructor}</em> : null}
        </label>
        <label className="field">
          <span>Room</span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <label className="field">
          <span>Starts</span>
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
          {errors.startsAt ? <em className="field-error">{errors.startsAt}</em> : null}
        </label>
        <label className="field">
          <span>Length in minutes</span>
          <input type="number" min={15} step={15} value={duration} onChange={(event) => setDuration(event.target.value)} />
          {errors.durationMinutes ? <em className="field-error">{errors.durationMinutes}</em> : null}
        </label>
        {workshop ? (
          <label className="field span-2">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as WorkshopStatus)}>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        ) : null}
        <label className="field span-2">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="actions span-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Discard
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving" : workshop ? "Save changes" : "Add workshop"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
