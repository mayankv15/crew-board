// The skills a datacentre position can ask for. HR has no skills field, so
// these are derived from department and job title (see api/src/integration/mapping.ts).
export const SKILLS = [
  'network-engineering',
  'server-installation',
  'fibre-cabling',
  'hardware-support',
  'systems-administration',
  'commissioning',
  'project-management',
  'site-coordination',
] as const;

export type Skill = (typeof SKILLS)[number];
