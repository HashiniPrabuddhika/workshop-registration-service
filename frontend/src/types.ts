export type Role = "admin" | "manager" | "staff";
export type WorkshopStatus = "scheduled" | "cancelled" | "completed";
export type RegistrationStatus = "active" | "cancelled";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface ManagedUser extends User {
  isActive: boolean;
  createdAt: string;
}

export interface Workshop {
  id: number;
  code: string;
  title: string;
  instructor: string;
  description: string;
  location: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  status: WorkshopStatus;
  activeCount: number;
  seatsAvailable: number;
  createdAt: string;
  updatedAt: string;
}

export interface Registration {
  id: number;
  workshopId: number;
  workshopCode: string;
  workshopTitle: string;
  attendeeName: string;
  attendeeEmail: string;
  status: RegistrationStatus;
  registeredBy: { id: number; name: string };
  registeredAt: string;
  cancelledBy: { id: number; name: string } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface AuditEntry {
  id: number;
  actor: { id: number; name: string };
  action: string;
  entityType: "user" | "workshop";
  entityId: number;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface WorkshopInput {
  code: string;
  title: string;
  instructor: string;
  description: string;
  location: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
}
