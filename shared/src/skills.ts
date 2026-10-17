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
