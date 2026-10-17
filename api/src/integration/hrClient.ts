import { z } from 'zod';

interface HrPage {
  users: unknown[];
  total: number;
}

export interface HrClient {
  fetchPage(skip: number, limit: number): Promise<HrPage>;
}

class HrError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, retryable: boolean, retryAfterMs?: number) {
    super(message);
    this.name = 'HrError';
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface HttpHrClientOptions {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxBodyBytes?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const Envelope = z.object({ users: z.array(z.unknown()), total: z.number().int().min(0) });

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelay(attempt: number, baseMs: number, capMs: number, random: () => number): number {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * (exp / 2));
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export function createHttpHrClient(options: HttpHrClientOptions): HrClient {
  const { baseUrl, timeoutMs, maxRetries } = options;
  const baseDelay = options.baseDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 8000;
  const maxBytes = options.maxBodyBytes ?? 5 * 1024 * 1024;
  const sleep = options.sleep ?? wait;
  const random = options.random ?? Math.random;

  async function attemptOnce(skip: number, limit: number): Promise<HrPage> {
    const url = new URL('/users', baseUrl);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('skip', String(skip));
    url.searchParams.set('select', 'id,firstName,lastName,company,address');

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new HrError(timedOut ? `timed out after ${timeoutMs} ms` : `network error: ${(e as Error).message}`, true);
    }

    if (res.status === 429 || res.status >= 500) {
      throw new HrError(`HR responded ${res.status}`, true, parseRetryAfter(res.headers.get('retry-after')));
    }
    if (!res.ok) throw new HrError(`HR responded ${res.status}`, false);

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new HrError(`response too large (${declared} bytes)`, false);
    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      throw new HrError(`could not read response: ${(e as Error).message}`, true);
    }
    if (text.length > maxBytes) throw new HrError('response too large', false);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new HrError('response was not valid JSON', true);
    }
    const parsed = Envelope.safeParse(json);
    if (!parsed.success) throw new HrError('response did not have the expected shape', false);
    return parsed.data;
  }

  return {
    async fetchPage(skip, limit) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await attemptOnce(skip, limit);
        } catch (e) {
          const err = e instanceof HrError ? e : new HrError((e as Error).message, false);
          if (!err.retryable || attempt >= maxRetries) {
            throw new HrError(`${err.message} (after ${attempt + 1} attempt${attempt === 0 ? '' : 's'})`, false);
          }
          const delay = backoffDelay(attempt, baseDelay, maxDelay, random);
          await sleep(Math.min(Math.max(delay, err.retryAfterMs ?? 0), maxDelay * 2));
        }
      }
    },
  };
}
