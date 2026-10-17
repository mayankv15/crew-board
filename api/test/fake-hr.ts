import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Behaviour = 'ok' | { status: number; headers?: Record<string, string> } | 'hang' | 'garbage';

export interface FakeHr {
  url: string;
  requests: { skip: number; limit: number; query: string }[];
  setUsers(users: unknown[]): void;
  // Decide how each request behaves: gets the page offset and how many times that offset was requested so far.
  behave(fn: (skip: number, attempt: number) => Behaviour): void;
  close(): Promise<void>;
}

export async function startFakeHr(initial: unknown[]): Promise<FakeHr> {
  let users = initial;
  let behave: (skip: number, attempt: number) => Behaviour = () => 'ok';
  const requests: FakeHr['requests'] = [];
  const attempts = new Map<number, number>();

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const skip = Number(url.searchParams.get('skip') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 30);
    requests.push({ skip, limit, query: url.search });
    const attempt = attempts.get(skip) ?? 0;
    attempts.set(skip, attempt + 1);

    const b = behave(skip, attempt);
    if (b === 'hang') return; // never answers; the client must time out
    if (b === 'garbage') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return void res.end('{"users": [');
    }
    if (b !== 'ok') {
      res.writeHead(b.status, b.headers);
      return void res.end('{}');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ users: users.slice(skip, skip + limit), total: users.length, skip, limit }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    setUsers: (u) => {
      users = u;
    },
    behave: (fn) => {
      behave = fn;
      attempts.clear();
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
