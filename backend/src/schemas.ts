import { z } from "zod";
import { AppError } from "./errors";

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Some fields are invalid",
      result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }))
    );
  }
  return result.data;
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const isoDateTime = z
  .string()
  .datetime({ offset: true, message: "Enter a valid date and time" })
  .transform((value) => new Date(value).toISOString());

export const roleSchema = z.enum(["admin", "manager", "staff"]);
export const workshopStatusSchema = z.enum(["scheduled", "cancelled", "completed"]);

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const id = z.coerce.number().int().positive();

export const idParamSchema = z.object({ id });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200)
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email,
  password: z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters"),
  role: roleSchema
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: roleSchema,
    isActive: z.boolean(),
    password: z.string().min(8, "Use at least 8 characters").max(72)
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

const workshopFields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, "Use 2-20 letters, numbers or dashes"),
  title: z.string().trim().min(1, "Title is required").max(150),
  instructor: z.string().trim().min(1, "Instructor is required").max(100),
  description: z.string().trim().max(2000),
  location: z.string().trim().max(150),
  startsAt: isoDateTime,
  durationMinutes: z.number().int().min(15).max(1440),
  capacity: z.number().int().min(1, "At least 1 seat").max(500)
};

export const createWorkshopSchema = z.object({
  code: workshopFields.code,
  title: workshopFields.title,
  instructor: workshopFields.instructor,
  description: workshopFields.description.default(""),
  location: workshopFields.location.default(""),
  startsAt: workshopFields.startsAt,
  durationMinutes: workshopFields.durationMinutes.default(120),
  capacity: workshopFields.capacity
});

export const updateWorkshopSchema = z
  .object({ ...workshopFields, status: workshopStatusSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const workshopQuerySchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  status: workshopStatusSchema.optional(),
  hasSeats: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  q: z.string().trim().max(100).optional(),
  page,
  pageSize
});

export const registerSchema = z.object({
  attendeeName: z.string().trim().min(1, "Name is required").max(100),
  attendeeEmail: email
});

export const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional()
});

export const registrationQuerySchema = z.object({
  workshopId: id.optional(),
  status: z.enum(["active", "cancelled"]).optional(),
  email: z.string().trim().toLowerCase().max(254).optional(),
  page,
  pageSize
});

export const auditQuerySchema = z.object({
  entityType: z.enum(["user", "workshop"]).optional(),
  page,
  pageSize
});
