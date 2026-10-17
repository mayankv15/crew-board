import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { signPayload } from '../integration/signature.ts';

// Sends a correctly signed test event to the running API.
//   npm run webhook:test -- --type technician.deactivated --external-id 5
//   npm run webhook:test -- --type technician.updated --external-id 5 --city Dallas --state Texas
// Extra flags: --replay (send the same event twice), --bad-signature, --stale (old timestamp), --url
const { values } = parseArgs({
  options: {
    type: { type: 'string', default: 'technician.updated' },
    'external-id': { type: 'string', default: '1' },
    id: { type: 'string' },
    name: { type: 'string', default: 'Test Technician' },
    department: { type: 'string', default: 'Engineering' },
    title: { type: 'string', default: 'Engineer' },
    city: { type: 'string', default: 'Phoenix' },
    state: { type: 'string', default: 'Arizona' },
    active: { type: 'string' },
    url: { type: 'string' },
    replay: { type: 'boolean', default: false },
    'bad-signature': { type: 'boolean', default: false },
    stale: { type: 'boolean', default: false },
  },
});

const secret = process.env.HR_WEBHOOK_SECRET;
if (!secret || secret.length < 32) {
  console.error('HR_WEBHOOK_SECRET must be set (run `npm run setup` once, it creates .env).');
  process.exit(1);
}
const url = values.url ?? process.env.WEBHOOK_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}/webhooks/hr`;
const externalId = Number(values['external-id']);
const type = values.type === 'updated' || values.type === 'deactivated' ? `technician.${values.type}` : values.type;
const [firstName = 'Test', ...rest] = (values.name ?? '').split(' ');

const event =
  type === 'technician.deactivated'
    ? { id: values.id ?? `evt_${randomUUID()}`, type, occurredAt: new Date().toISOString(), data: { id: externalId } }
    : {
        id: values.id ?? `evt_${randomUUID()}`,
        type,
        occurredAt: new Date().toISOString(),
        data: {
          id: externalId,
          firstName,
          lastName: rest.join(' '),
          company: { department: values.department, title: values.title },
          address: { city: values.city, state: values.state, country: 'United States' },
          ...(values.active === undefined ? {} : { active: values.active === 'true' }),
        },
      };

const rawBody = JSON.stringify(event);

async function send(label: string) {
  const timestamp = String(Math.floor(Date.now() / 1000) - (values.stale ? 3600 : 0));
  const signature = values['bad-signature'] ? `sha256=${'0'.repeat(64)}` : signPayload(secret!, timestamp, rawBody);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hr-timestamp': timestamp, 'x-hr-signature': signature },
    body: rawBody,
  });
  console.log(`${label}: ${res.status} ${await res.text()}`);
}

console.log(`POST ${url}\n${rawBody}`);
await send('first send');
if (values.replay) await send('replay');
