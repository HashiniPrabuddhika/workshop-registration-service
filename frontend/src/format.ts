const dateFormat = new Intl.DateTimeFormat("en-LK", { weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("en-LK", { hour: "numeric", minute: "2-digit" });
const stampFormat = new Intl.DateTimeFormat("en-LK", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit"
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
export const formatStamp = (iso: string) => stampFormat.format(new Date(iso));

export function formatRange(iso: string, minutes: number) {
  const end = new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
  return `${formatTime(iso)} to ${formatTime(end)}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

export function toDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toDateTimeInput(iso: string) {
  const date = new Date(iso);
  return `${toDateInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function startOfDayIso(dateInput: string) {
  const [year, month, day] = dateInput.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

export function endOfDayIso(dateInput: string) {
  const [year, month, day] = dateInput.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export const roleLabel = { admin: "Admin", manager: "Manager", staff: "Front desk" } as const;
