import type { Skill } from '@crew-board/shared';
import { z } from 'zod';
import type { TechnicianInput } from '../repositories/upsert.ts';

// What we accept from the HR system. z.object strips every key not listed here, so the sensitive
// fields dummyjson returns (password, ssn, ein, bank, crypto, ip, macAddress...) are dropped at the
// boundary and can never reach the database or the logs.
const short = (max: number) => z.string().trim().max(max);

export const HrUserSchema = z.object({
  id: z.number().int().positive(),
  firstName: short(80).min(1),
  lastName: short(80).default(''),
  company: z.object({ department: short(80), title: short(120) }),
  address: z.object({ city: short(80), state: short(80), country: short(80) }),
});
export type HrUser = z.infer<typeof HrUserSchema>;

// HR has no skills field, so skills are derived. The department gives the main skill; the job title
// can add more. A department we do not know gives no skill: the person is stored and visible but
// cannot be assigned, so a new HR value never breaks a sync.
export const DEPARTMENT_SKILLS: Readonly<Record<string, Skill>> = {
  Engineering: 'network-engineering',
  'Research and Development': 'server-installation',
  Services: 'fibre-cabling',
  Support: 'hardware-support',
  Training: 'site-coordination',
  'Product Management': 'project-management',
  'Business Development': 'project-management',
};

const TITLE_SKILLS: readonly (readonly [RegExp, Skill])[] = [
  [/database|systems? (administrator|analyst)/i, 'systems-administration'],
  [/support/i, 'hardware-support'],
  [/project manager/i, 'project-management'],
  [/quality assurance/i, 'commissioning'],
];

export function deriveSkills(department: string, title: string): Skill[] {
  const skills = new Set<Skill>();
  const fromDepartment = DEPARTMENT_SKILLS[department];
  if (fromDepartment) skills.add(fromDepartment);
  for (const [pattern, skill] of TITLE_SKILLS) if (pattern.test(title)) skills.add(skill);
  return [...skills].sort();
}

export function toTechnicianInput(user: HrUser): TechnicianInput {
  return {
    externalId: user.id,
    name: `${user.firstName} ${user.lastName}`.trim(),
    title: user.company.title,
    department: user.company.department,
    city: user.address.city,
    state: user.address.state,
    country: user.address.country,
    skills: deriveSkills(user.company.department, user.company.title),
  };
}
