import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeStore } from '../src/app/store.ts';
import { SyncPage } from '../src/features/sync/SyncPage.tsx';
import { apiError, run } from './helpers.tsx';
import { server } from './server.ts';

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

  it('starts a run, shows live progress without a reload, and finishes', async () => {
    let polls = 0;
    let started = false;
    server.use(
      http.post('*/api/sync/technicians', () => {
        started = true;
        return HttpResponse.json({ runId: 'r-new' }, { status: 202 });
      }),
      http.get('*/api/sync/runs', () => {
        if (!started) return HttpResponse.json([run({ id: 'old' })]);
        polls += 1;
        if (polls < 3)
          return HttpResponse.json([
            run({
              id: 'r-new',
              status: 'running',
              finishedAt: null,
              pagesDone: polls,
              pagesTotal: 7,
              created: polls * 30,
              updated: 0,
              unchanged: 0,
            }),
            run({ id: 'old' }),
          ]);
        return HttpResponse.json([run({ id: 'r-new', created: 208, updated: 0, unchanged: 0 }), run({ id: 'old' })]);
      }),
    );
    renderSync();
    const button = await screen.findByRole('button', { name: 'Run sync now' });
    await userEvent.click(button);

    expect(await screen.findByRole('button', { name: /Syncing, page \d of 7/ })).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: 'Sync progress' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Run sync now' })).toBeEnabled(), { timeout: 3000 });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('208');
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
