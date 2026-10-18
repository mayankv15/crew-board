import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { position, positionsHandler, recordRequests, renderApp, run } from './helpers.tsx';
import { server } from './server.ts';

const board = () => positionsHandler([position()]);

describe('HR data status in the header', () => {
  it('says when nothing has ever been synced', async () => {
    server.use(board());
    renderApp();
    expect(await screen.findByRole('link', { name: /HR data: never synced/ })).toHaveAttribute('href', '/sync');
  });

  it('shows a healthy sync with how long ago it finished', async () => {
    server.use(
      board(),
      http.get('*/api/sync/runs', () =>
        HttpResponse.json([run({ finishedAt: new Date(Date.now() - 5 * 60_000).toISOString() })]),
      ),
    );
    renderApp();
    expect(await screen.findByRole('link', { name: /HR data synced 5 min ago/ })).toBeInTheDocument();
  });

  it.each([
    ['partial', /Last sync partial/],
    ['failed', /Last sync failed/],
    ['running', /Syncing HR data/],
  ] as const)('flags a %s run', async (status, label) => {
    server.use(
      board(),
      http.get('*/api/sync/runs', () =>
        HttpResponse.json([run({ status, finishedAt: status === 'running' ? null : new Date().toISOString() })]),
      ),
    );
    renderApp();
    expect(await screen.findByRole('link', { name: label })).toBeInTheDocument();
  });

  it('asks for the latest run only, not the whole history', async () => {
    server.use(board());
    const urls = recordRequests();
    renderApp();
    await screen.findByRole('link', { name: /HR data: never synced/ });
    expect(
      urls()
        .filter((u) => u.pathname === '/api/sync/runs')
        .map((u) => u.searchParams.get('limit')),
    ).toEqual(['1']);
  });

  it('does not hide an unreachable sync status behind a spinner', async () => {
    server.use(
      board(),
      http.get('*/api/sync/runs', () => HttpResponse.error()),
    );
    renderApp();
    expect(await screen.findByRole('link', { name: /HR status unknown/ })).toBeInTheDocument();
  });
});

describe('colour theme', () => {
  it('cycles system, light, dark from the header and says which one is active', async () => {
    server.use(board());
    renderApp();
    const toggle = await screen.findByRole('button', { name: /Colour theme: Following your system/ });
    await userEvent.click(toggle);
    expect(await screen.findByRole('button', { name: /Colour theme: Light/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Colour theme: Light/ }));
    expect(await screen.findByRole('button', { name: /Colour theme: Dark/ })).toBeInTheDocument();
  });
});

describe('page structure', () => {
  it('offers a skip link, a main landmark and a labelled navigation', async () => {
    server.use(board());
    renderApp();
    expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('aria-current', 'page');
  });
});
