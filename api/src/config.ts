import { z } from 'zod';

const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/crewboard.db'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: boolish.default(false),
  HR_BASE_URL: z.url().default('https://dummyjson.com'),
  HR_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),
  HR_MAX_RETRIES: z.coerce.number().int().min(0).max(6).default(3),
  // Shared secret for webhook signatures. Required, no default, so a missing secret stops the boot.
  HR_WEBHOOK_SECRET: z.string().min(32, 'HR_WEBHOOK_SECRET must be at least 32 characters'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_SYNC_MAX: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().min(1).default(300),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === 'production' && !config.HR_BASE_URL.startsWith('https://')) {
    throw new Error('Invalid configuration:\n  HR_BASE_URL must use https in production');
  }
  return config;
}
