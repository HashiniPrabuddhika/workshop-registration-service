import type { RegistrationStatus, WorkshopStatus } from "../types";

const labels: Record<WorkshopStatus | RegistrationStatus, string> = {
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  completed: "Completed",
  active: "Registered"
};

export function StatusBadge({ status }: { status: WorkshopStatus | RegistrationStatus }) {
  return <span className={`badge badge-${status}`}>{labels[status]}</span>;
}
