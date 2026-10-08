import { z } from "zod";

export const schedule = z.strictObject({
  local_date: z.iso.date(),
  local_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(100),
});

export const reminderCreate = schedule.extend({
  message: z.string().trim().min(1).max(280),
  send_whatsapp: z.boolean().default(false),
});

export const reminderPatch = z.strictObject({
  expected_version: z.number().int().positive(),
  message: z.string().trim().min(1).max(280).optional(),
  local_date: z.iso.date().optional(),
  local_time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  timezone: z.string().min(1).max(100).optional(),
  send_whatsapp: z.boolean().optional(),
});

export const whatsappDestination = z.strictObject({
  phone: z.string().min(8).max(40),
  consent: z.literal(true),
});

export const versionInput = z.strictObject({
  expected_version: z.number().int().positive(),
});
