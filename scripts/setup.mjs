// One-time local setup: creates .env with a freshly generated webhook secret if it does not exist.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  console.log('.env already exists, leaving it alone.');
} else {
  const secret = randomBytes(32).toString('hex');
  const env = readFileSync('.env.example', 'utf8').replace(/^HR_WEBHOOK_SECRET=.*$/m, `HR_WEBHOOK_SECRET=${secret}`);
  writeFileSync('.env', env, { mode: 0o600 });
  console.log('Created .env with a random HR_WEBHOOK_SECRET.');
}
