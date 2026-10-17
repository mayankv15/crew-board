import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';

export function signPayload(secret: string, timestamp: string, rawBody: Buffer | string): string {
  const mac = createHmac('sha256', secret).update(timestamp).update('.').update(rawBody).digest('hex');
  return PREFIX + mac;
}

export interface VerifyInput {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
  nowSeconds: number;
  toleranceSeconds?: number;
}

export function verifySignature(input: VerifyInput): boolean {
  const { secret, timestamp, signature, rawBody, nowSeconds } = input;
  const tolerance = input.toleranceSeconds ?? 300;
  if (!timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) return false;
  if (!/^sha256=[0-9a-f]{64}$/.test(signature)) return false;

  const expected = Buffer.from(signPayload(secret, timestamp, rawBody).slice(PREFIX.length), 'hex');
  const given = Buffer.from(signature.slice(PREFIX.length), 'hex');
  return timingSafeEqual(expected, given);
}
