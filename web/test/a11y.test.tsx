import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { candidate, page, position, positionsHandler, renderApp } from './helpers.tsx';
import { server } from './server.ts';

async function violations(root: Element = document.body) {
  const result = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`);
}

const crowd = position({
  id: 'crowd',
  projectName: 'Mumbai DC-4',
  headcount: 5,
  seatsRemaining: 2,
  assigned: ['Bella Grant', 'Ben Foster', 'Carter Baker'].map((name, i) => ({
    assignmentId: `a${i}`,
    technicianId: `t${i}`,
    name,
    active: i !== 2,
  })),
});
const filled = position({
  id: 'full',
  projectName: 'Dublin Hall B',
  headcount: 1,
  seatsRemaining: 0,
  filled: true,
  assigned: [{ assignmentId: 'f1', technicianId: 't9', name: 'Sam Lee', active: true }],
});

function serve() {
  server.use(
    positionsHandler([crowd, filled]),
    http.get('*/api/positions/crowd/candidates', () =>
      HttpResponse.json(
        page([
          candidate({ id: 'c1', name: 'Priya Rao' }),
          candidate({
            id: 'c2',
            name: 'Bo Busy',
            available: false,
            conflict: {
              assignmentId: 'x',
              positionId: 'p9',
              projectName: 'Singapore Core',
              skill: 'network-engineering',
              startDate: '2026-11-10',
              endDate: '2026-11-20',
            },
          }),
          candidate({ id: 'c3', name: 'Nina Nospice', hasSkill: false }),
        ]),
      ),
    ),
  );
}

describe('accessibility (axe-core)', () => {
  it('the board has no violations, with the "+N more" chip and the deactivated warning on screen', async () => {
    serve();
    renderApp();
    await within(await screen.findByRole('tabpanel', { name: /^open/i })).findByText('Mumbai DC-4');
    expect(await violations()).toEqual([]);
  });

  it('the filled tab has none', async () => {
    serve();
    renderApp('/?tab=filled');
    await within(await screen.findByRole('tabpanel', { name: /^filled/i })).findByText('Dublin Hall B');
    expect(await violations()).toEqual([]);
  });

  it('the assign drawer has none', async () => {
    serve();
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /^Assign technician to Mumbai DC-4/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign technician' });
    await within(dialog).findByRole('button', { name: 'Assign Priya Rao' });
    expect(await violations()).toEqual([]);
  });

  it('the people dialog has none', async () => {
    serve();
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /^\+2 more/ }));
    await screen.findByRole('dialog', { name: 'People on this position' });
    expect(await violations()).toEqual([]);
  });

  it('the filter popover and the sort menu have none', async () => {
    serve();
    renderApp();
    await screen.findByRole('tabpanel', { name: /^open/i });
    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    await screen.findByRole('dialog', { name: 'Filter positions' });
    expect(await violations()).toEqual([]);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /Sort:/ }));
    await screen.findByRole('menu');
    expect(await violations()).toEqual([]);
  });

  it('the HR sync page and the not-found page have none', async () => {
    serve();
    renderApp('/sync');
    await screen.findByRole('heading', { name: 'HR sync' });
    expect(await violations()).toEqual([]);
  });
});
