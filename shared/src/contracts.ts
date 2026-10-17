import { z } from 'zod';
import { IsoDate, PageQuery, SkillSchema } from './common.ts';

const text = (max: number) => z.string().trim().min(1).max(max);

// ---- Projects -------------------------------------------------------------

export const CreateProjectBody = z.strictObject({
  name: text(120),
  client: text(120),
  site: text(120),
});
export type CreateProjectBody = z.infer<typeof CreateProjectBody>;

export const ProjectQuery = PageQuery.extend({ q: text(80).optional() });
export type ProjectQuery = z.infer<typeof ProjectQuery>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  client: z.string(),
  site: z.string(),
  createdAt: z.string(),
  positionCount: z.number().int(),
});
export type Project = z.infer<typeof ProjectSchema>;

// ---- Positions ------------------------------------------------------------

export const CreatePositionBody = z
  .strictObject({
    skill: SkillSchema,
    startDate: IsoDate,
    endDate: IsoDate,
    headcount: z.number().int().min(1).max(50),
  })
  .refine((p) => p.endDate >= p.startDate, {
    path: ['endDate'],
    message: 'End date must be on or after the start date',
  });
export type CreatePositionBody = z.infer<typeof CreatePositionBody>;

export const PositionQuery = PageQuery.extend({
  projectId: z.string().optional(),
  skill: SkillSchema.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  status: z.enum(['open', 'filled']).optional(),
});
export type PositionQuery = z.infer<typeof PositionQuery>;

export const AssignedPersonSchema = z.object({
  assignmentId: z.string(),
  technicianId: z.string(),
  name: z.string(),
  // false when HR deactivated them: the assignment is kept but no longer counts as a seat.
  active: z.boolean(),
});
export type AssignedPerson = z.infer<typeof AssignedPersonSchema>;

export const PositionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  skill: SkillSchema,
  startDate: IsoDate,
  endDate: IsoDate,
  headcount: z.number().int(),
  assigned: z.array(AssignedPersonSchema),
  // Derived on every read, never stored. See api/src/repositories/positions.ts.
  seatsRemaining: z.number().int(),
  filled: z.boolean(),
});
export type Position = z.infer<typeof PositionSchema>;

// ---- Technicians ----------------------------------------------------------

const boolFromQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

export const TechnicianQuery = PageQuery.extend({
  skill: SkillSchema.optional(),
  state: text(60).optional(),
  city: text(60).optional(),
  q: text(80).optional(),
  active: boolFromQuery.optional(),
  availableFrom: IsoDate.optional(),
  availableTo: IsoDate.optional(),
}).refine((q) => (q.availableFrom === undefined) === (q.availableTo === undefined), {
  path: ['availableTo'],
  message: 'Give both availableFrom and availableTo, or neither',
}).refine((q) => !q.availableFrom || !q.availableTo || q.availableTo >= q.availableFrom, {
  path: ['availableTo'],
  message: 'availableTo must be on or after availableFrom',
});
export type TechnicianQuery = z.infer<typeof TechnicianQuery>;

export const TechnicianSchema = z.object({
  id: z.string(),
  externalId: z.number().int(),
  name: z.string(),
  title: z.string(),
  department: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  active: z.boolean(),
  skills: z.array(SkillSchema),
});
export type Technician = z.infer<typeof TechnicianSchema>;

export const ConflictSchema = z.object({
  assignmentId: z.string(),
  positionId: z.string(),
  projectName: z.string(),
  skill: SkillSchema,
  startDate: IsoDate,
  endDate: IsoDate,
});
export type Conflict = z.infer<typeof ConflictSchema>;

export const CandidateQuery = PageQuery.extend({ q: text(80).optional() });
export type CandidateQuery = z.infer<typeof CandidateQuery>;

export const CandidateSchema = TechnicianSchema.extend({
  hasSkill: z.boolean(),
  available: z.boolean(),
  conflict: ConflictSchema.nullable(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

// ---- Assignments ----------------------------------------------------------

export const CreateAssignmentBody = z.strictObject({ technicianId: z.string().min(1).max(64) });
export type CreateAssignmentBody = z.infer<typeof CreateAssignmentBody>;

export const AssignmentSchema = z.object({
  id: z.string(),
  positionId: z.string(),
  technicianId: z.string(),
  startDate: IsoDate,
  endDate: IsoDate,
  createdAt: z.string(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

// ---- Sync -----------------------------------------------------------------

export const SyncRunSchema = z.object({
  id: z.string(),
  trigger: z.enum(['api', 'cli']),
  status: z.enum(['running', 'succeeded', 'partial', 'failed']),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  pagesDone: z.number().int(),
  pagesTotal: z.number().int().nullable(),
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  deactivated: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.object({ scope: z.string(), message: z.string() })),
});
export type SyncRun = z.infer<typeof SyncRunSchema>;

export const SyncRunsQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });
export type SyncRunsQuery = z.infer<typeof SyncRunsQuery>;

export const StartSyncResponse = z.object({ runId: z.string() });
export type StartSyncResponse = z.infer<typeof StartSyncResponse>;
