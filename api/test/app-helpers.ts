import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig, type Config } from '../src/config.ts';
import type { Db } from '../src/db/connection.ts';
import type { HrClient } from '../src/integration/hrClient.ts';
import { signPayload } from '../src/integration/signature.ts';
import { freshDb } from './helpers.ts';

export const SECRET = 'test-secret-test-secret-test-secret-0123456789';

const unreachableHr: HrClient = {
  async fetchPage() {
    throw new Error('HR should not be called in this test');
  },
};

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  config: Config;
}

export async function testApp(over: { hr?: HrClient; env?: Record<string, string> } = {}): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: 'test',
    HR_WEBHOOK_SECRET: SECRET,
    RATE_LIMIT_MAX: '10000',
    RATE_LIMIT_SYNC_MAX: '10000',
    RATE_LIMIT_WEBHOOK_MAX: '10000',
    ...over.env,
  });
  const db = freshDb();
  const app = await buildApp({ config, db, hr: over.hr ?? unreachableHr, logger: false });
  return { app, db, config };
}

export function signedHeaders(body: string, opts: { secret?: string; timestamp?: number } = {}) {
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-hr-timestamp': timestamp,
    'x-hr-signature': signPayload(opts.secret ?? SECRET, timestamp, body),
  };
}

export const hrUser = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  firstName: `First${id}`,
  lastName: `Last${id}`,
  company: { department: 'Engineering', title: 'Engineer' },
  address: { city: 'Phoenix', state: 'Arizona', country: 'United States' },
  ...over,
});
