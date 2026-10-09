import type {
  AuditEntry,
  ManagedUser,
  Paged,
  Registration,
  Role,
  User,
  Workshop,
  WorkshopInput,
  WorkshopStatus
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "wr.token";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; message: string }[]
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY)
};

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

type Query = { [key: string]: string | number | boolean | undefined };

async function request<T>(path: string, options: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "" && value !== false) {
      url.searchParams.set(key, String(value));
    }
  }
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection and try again");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    if (response.status === 401 && token && error?.code !== "INVALID_CREDENTIALS") {
      unauthorizedHandler?.();
    }
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? "Something went wrong. Try again",
      error?.details
    );
  }
  return payload as T;
}

export type WorkshopQuery = {
  from?: string;
  to?: string;
  status?: WorkshopStatus | "";
  hasSeats?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
};

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } }),
  me: () => request<{ user: User }>("/auth/me"),

  listWorkshops: (query: WorkshopQuery) => request<Paged<Workshop>>("/workshops", { query }),
  getWorkshop: (id: number) => request<{ data: Workshop }>(`/workshops/${id}`),
  createWorkshop: (input: WorkshopInput) => request<{ data: Workshop }>("/workshops", { method: "POST", body: input }),
  updateWorkshop: (id: number, patch: Partial<WorkshopInput> & { status?: WorkshopStatus }) =>
    request<{ data: Workshop }>(`/workshops/${id}`, { method: "PATCH", body: patch }),

  listRegistrations: (workshopId: number, status?: "active" | "cancelled") =>
    request<Paged<Registration>>(`/workshops/${workshopId}/registrations`, {
      query: { status, pageSize: 100 }
    }),
  register: (workshopId: number, attendeeName: string, attendeeEmail: string) =>
    request<{ data: Registration }>(`/workshops/${workshopId}/registrations`, {
      method: "POST",
      body: { attendeeName, attendeeEmail }
    }),
  cancelRegistration: (id: number, reason: string) =>
    request<{ data: Registration }>(`/registrations/${id}/cancel`, { method: "POST", body: { reason } }),

  listUsers: () => request<{ data: ManagedUser[] }>("/users"),
  createUser: (input: { name: string; email: string; password: string; role: Role }) =>
    request<{ data: ManagedUser }>("/users", { method: "POST", body: input }),
  updateUser: (id: number, patch: { name?: string; role?: Role; isActive?: boolean; password?: string }) =>
    request<{ data: ManagedUser }>(`/users/${id}`, { method: "PATCH", body: patch }),

  listAudit: (page: number, entityType?: "user" | "workshop") =>
    request<Paged<AuditEntry>>("/audit", { query: { page, pageSize: 25, entityType } })
};
