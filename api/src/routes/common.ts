import { z } from 'zod';

export const IdParams = z.object({ id: z.string().min(1).max(64) });
