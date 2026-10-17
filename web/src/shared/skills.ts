import type { Skill } from '@crew-board/shared';

export const skillLabel = (skill: Skill): string => skill.replace(/-/g, ' ');
