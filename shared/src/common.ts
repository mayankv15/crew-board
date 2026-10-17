import { z } from 'zod';
import { SKILLS } from './skills.ts';

export const SkillSchema = z.enum(SKILLS);

// Calendar day, YYYY-MM-DD. Dates carry no time or zone, so there is no timezone logic anywhere.
export const IsoDate = z.iso.date();

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });

export type Page<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_SIGNATURE',
  'NOT_FOUND',
  'ASSIGNMENT_OVERLAP',
  'SKILL_MISSING',
  'POSITION_FULL',
  'ALREADY_ASSIGNED',
  'TECHNICIAN_INACTIVE',
  'SYNC_IN_PROGRESS',
  'DUPLICATE_EVENT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// The one error shape every endpoint returns.
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
