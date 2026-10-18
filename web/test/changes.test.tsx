import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, onTestFinished } from 'vitest';
import { makeStore } from '../src/app/store.ts';
import { useGetPositionsQuery } from '../src/shared/api.ts';
import { useChangeWatcher } from '../src/shared/useChangeWatcher.ts';
import { position, positionsResponse } from './helpers.tsx';
import { server } from './server.ts';

const POLL = 25;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

/** A board with one list on screen, the watcher on, and counters for what the API was asked. */
function setup(initialVersion = 0) {
  const asked = { changes: 0, positions: 0 };
  let version = initialVersion;
  server.use(
    http.get('*/api/changes', () => {
      asked.changes += 1;
      return HttpResponse.json({ version });
    }),
    http.get(/\/api\/positions$/, ({ request }) => {
      asked.positions += 1;
      return HttpResponse.json(positionsResponse([position()], new URL(request.url)));
    }),
  );
  onTestFinished(() => setVisibility('visible'));
  const store = makeStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  renderHook(
    () => {
      useChangeWatcher(POLL);
      return useGetPositionsQuery({ status: 'open', page: 1, pageSize: 25, sort: 'start' });
    },
    { wrapper },
  );
  return { asked, bump: () => (version += 1) };
}

describe('useChangeWatcher', () => {
  it('polls the version without refetching the lists while it stays the same', async () => {
    const { asked } = setup();
    await waitFor(() => expect(asked.changes).toBeGreaterThanOrEqual(4));
    expect(asked.positions).toBe(1);
  });

  it('refetches the lists once the version has moved', async () => {
    const { asked, bump } = setup();
    await waitFor(() => expect(asked.changes).toBeGreaterThanOrEqual(2));
    bump();
    await waitFor(() => expect(asked.positions).toBe(2));
    await wait(POLL * 6);
    expect(asked.positions).toBe(2);
  });

  it('does not treat the very first answer as a change, whatever number it is', async () => {
    const { asked } = setup(41);
    await waitFor(() => expect(asked.changes).toBeGreaterThanOrEqual(3));
    expect(asked.positions).toBe(1);
  });

  it('stops polling while the tab is hidden and checks straight away when it is shown again', async () => {
    const { asked } = setup();
    await waitFor(() => expect(asked.changes).toBeGreaterThanOrEqual(2));

    act(() => setVisibility('hidden'));
    await wait(POLL * 2);
    const whenHidden = asked.changes;
    await wait(POLL * 6);
    expect(asked.changes).toBe(whenHidden);

    act(() => setVisibility('visible'));
    await waitFor(() => expect(asked.changes).toBeGreaterThan(whenHidden));
  });
});
