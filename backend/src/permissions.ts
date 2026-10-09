import { Role } from "./types";

export const PERMISSIONS = {
  "users:manage": ["admin"],
  "audit:read": ["admin"],
  "workshops:read": ["manager", "staff"],
  "workshops:write": ["manager"],
  "registrations:read": ["manager", "staff"],
  "registrations:write": ["manager", "staff"]
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
