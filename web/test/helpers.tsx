import type { Candidate, Position, SyncRun } from '@crew-board/shared';
import { setupListeners } from '@reduxjs/toolkit/query';
import { render } from '@testing-library/react';
import { onTestFinished } from 'vitest';
import { HttpResponse, http } from 'msw';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { App } from '../src/app/App.tsx';
import { makeStore } from '../src/app/store.ts';

export function renderApp(route = '/') {
  const store = makeStore();
  onTestFinished(setupListeners(store.dispatch));
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </Provider>,
  );
  return { store, ...view };
}

export const page = <T,>(data: T[]) => ({ data, page: 1, pageSize: 100, total: data.length, totalPages: 1 });

export const position = (over: Partial<Position> = {}): Position => ({
  id: 'pos-1',
  projectId: 'proj-1',
  projectName: 'Frankfurt DC-2',
  skill: 'network-engineering',
  startDate: '2026-11-03',
  endDate: '2026-11-14',
  headcount: 2,
  assigned: [],
  seatsRemaining: 2,
  filled: false,
  ...over,
});

export const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  id: 'tech-1',
  externalId: 1,
  name: 'Priya Rao',
  title: 'Network Engineer',
  department: 'Engineering',
  city: 'Austin',
  state: 'Texas',
  country: 'United States',
  active: true,
  skills: ['network-engineering'],
  hasSkill: true,
  alreadyAssigned: false,
  available: true,
  conflict: null,
  ...over,
});

export const run = (over: Partial<SyncRun> = {}): SyncRun => ({
  id: 'run-1',
  trigger: 'api',
  status: 'succeeded',
  startedAt: '2026-10-17T08:00:00.000Z',
  finishedAt: '2026-10-17T08:00:02.400Z',
  pagesDone: 7,
  pagesTotal: 7,
  created: 0,
  updated: 2,
  unchanged: 206,
  deactivated: 0,
  failed: 0,
  errors: [],
  ...over,
});

export const apiError = (code: string, message: string) => ({ error: { code, message, requestId: 'req-1' } });

export const positionsResponse = (list: Position[], url: URL) => {
  const status = url.searchParams.get('status');
  const size = Number(url.searchParams.get('pageSize') ?? 100);
  const page = Number(url.searchParams.get('page') ?? 1);
  const rows = list.filter((p) => !status || (status === 'filled') === p.filled);
  return {
    data: rows.slice((page - 1) * size, page * size),
    page,
    pageSize: size,
    total: rows.length,
    totalPages: Math.ceil(rows.length / size),
  };
};

export const summaryOf = (list: Position[]) => ({
  openPositions: list.filter((p) => !p.filled).length,
  filledPositions: list.filter((p) => p.filled).length,
  seatsToFill: list.reduce((n, p) => n + p.seatsRemaining, 0),
  needsReplacement: list.filter((p) => !p.filled && p.assigned.some((a) => !a.active)).length,
  startingWithin7: 0,
  unstaffedStartingWithin14: 0,
  partlyStaffed: list.filter((p) => !p.filled && p.assigned.length > 0).length,
});

export const positionsHandler = (list: Position[] | (() => Position[])) =>
  http.get(/\/api\/positions(\/summary)?$/, ({ request }) => {
    const rows = typeof list === 'function' ? list() : list;
    const url = new URL(request.url);
    return HttpResponse.json(url.pathname.endsWith('/summary') ? summaryOf(rows) : positionsResponse(rows, url));
  });
