import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, onTestFinished } from 'vitest';
import { makeStore } from '../src/app/store.ts';
import { SyncPage } from '../src/features/sync/SyncPage.tsx';
import { apiError, run } from './helpers.tsx';
import { server } from './server.ts';

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

const renderSync = () =>
  render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <SyncPage pollMs={30} />
      </MemoryRouter>
    </Provider>,
  );

describe('sync page', () => {
  it('lists the runs with counts and expandable errors', async () => {
    server.use(
      http.get('*/api/sync/runs', () =>
        HttpResponse.json([
          run({
            id: 'r2',
            status: 'partial',
            created: 3,
            failed: 1,
            errors: [{ scope: 'page 2', message: 'timed out after 5000 ms (after 4 attempts)' }],
          }),
          run({ id: 'r1', trigger: 'cli' }),
        ]),
      ),
    );
    renderSync();
    expect(screen.getByRole('status', { name: 'Loading sync runs' })).toBeInTheDocument();

    const items = await screen.findAllByRole('listitem');
    const partial = items[0]!;
    expect(within(partial).getByText('partial')).toBeInTheDocument();
    expect(within(partial).getByText('Created').nextSibling).toHaveTextContent('3');
    expect(within(partial).getByText('Failed').nextSibling).toHaveTextContent('1');
    await userEvent.click(within(partial).getByText('1 error'));
    expect(within(partial).getByText(/timed out after 5000 ms/)).toBeVisible();
    expect(screen.getByText(/started from the command line/)).toBeInTheDocument();
  });

  it('shows an empty state and an error state with retry', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/sync/runs', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.json(apiError('INTERNAL', 'Nope.'), { status: 500 }) : HttpResponse.json([]);
      }),
    );
    renderSync();
    const alert = await screen.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No sync has run yet')).toBeInTheDocument();
  });

  it('starts a run, shows live progress by polling that one run, and finishes', async () => {
    let started = false;
    let polls = 0;
    let listCalls = 0;
    const going = (pagesDone: number) =>
      run({
        id: 'r-new',
        status: 'running',
        finishedAt: null,
        pagesDone,
        pagesTotal: 7,
        created: pagesDone * 30,
        updated: 0,
        unchanged: 0,
      });
    const done = run({ id: 'r-new', created: 208, updated: 0, unchanged: 0 });
    server.use(
      http.post('*/api/sync/technicians', () => {
        started = true;
        return HttpResponse.json({ runId: 'r-new' }, { status: 202 });
      }),
      http.get('*/api/sync/runs', () => {
        listCalls += 1;
        if (!started) return HttpResponse.json([run({ id: 'old' })]);
        return HttpResponse.json([polls < 3 ? going(1) : done, run({ id: 'old' })]);
      }),
      http.get('*/api/sync/runs/r-new', () => {
        polls += 1;
        return HttpResponse.json(polls < 3 ? going(polls + 1) : done);
      }),
    );
    renderSync();
    await userEvent.click(await screen.findByRole('button', { name: 'Run sync now' }));

    expect(await screen.findByRole('button', { name: /Syncing, page \d of 7/ })).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: 'Sync progress' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Run sync now' })).toBeEnabled(), { timeout: 3000 });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('208');
    // The list is read when the page opens, when the run starts and when it finishes, and not on every poll.
    expect(polls).toBeGreaterThanOrEqual(3);
    expect(listCalls).toBe(3);
  });

  it('stops polling while the tab is hidden and carries on when it is shown again', async () => {
    let polls = 0;
    server.use(
      http.get('*/api/sync/runs', () =>
        HttpResponse.json([run({ id: 'r-live', status: 'running', finishedAt: null })]),
      ),
      http.get('*/api/sync/runs/r-live', () => {
        polls += 1;
        return HttpResponse.json(run({ id: 'r-live', status: 'running', finishedAt: null }));
      }),
    );
    onTestFinished(() => setVisibility('visible'));
    renderSync();
    await waitFor(() => expect(polls).toBeGreaterThanOrEqual(2));

    act(() => setVisibility('hidden'));
    await new Promise((r) => setTimeout(r, 60));
    const whenHidden = polls;
    await new Promise((r) => setTimeout(r, 150));
    expect(polls).toBe(whenHidden);

    act(() => setVisibility('visible'));
    await waitFor(() => expect(polls).toBeGreaterThan(whenHidden));
  });

  it('explains when a sync is already running', async () => {
    server.use(
      http.get('*/api/sync/runs', () => HttpResponse.json([run({ id: 'old' })])),
      http.post('*/api/sync/technicians', () =>
        HttpResponse.json(
          apiError('SYNC_IN_PROGRESS', 'A sync is already running. Wait for it to finish, then try again.'),
          { status: 409 },
        ),
      ),
    );
    renderSync();
    await userEvent.click(await screen.findByRole('button', { name: 'Run sync now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A sync is already running');
  });
});
