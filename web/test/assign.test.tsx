import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, candidate, page, position, positionsHandler, renderApp } from './helpers.tsx';
import { server } from './server.ts';

const target = position({ id: 'pos-1', headcount: 2, seatsRemaining: 2 });

const candidates = [
  candidate({ id: 'free', name: 'Priya Rao' }),
  candidate({
    id: 'busy',
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
  candidate({ id: 'noskill', name: 'Nina Nospice', hasSkill: false, skills: ['fibre-cabling'] }),
];

function useBoard(extra: Parameters<typeof server.use> = []) {
  server.use(
    ...extra,
    positionsHandler([target]),
    http.get('*/api/positions/pos-1/candidates', () => HttpResponse.json(page(candidates))),
  );
}

async function openDrawer() {
  renderApp();
  await userEvent.click(await screen.findByRole('button', { name: /^Assign technician/ }));
  return screen.findByRole('dialog', { name: 'Assign technician', hidden: true });
}

describe('assign drawer', () => {
  it('shows availability and the exact booking conflict inline, before anything is clicked', async () => {
    useBoard();
    const dialog = await openDrawer();
    const list = await within(dialog).findByRole('list', { name: 'Technicians' });
    const rows = within(list).getAllByRole('listitem');

    expect(within(rows[0]!).getByText(/Available for these dates/)).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('button', { name: 'Assign Priya Rao' })).toBeEnabled();

    expect(within(rows[1]!).getByText(/Busy 10 Nov 2026 to 20 Nov 2026 on Singapore Core/)).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: 'Assign Bo Busy' })).toBeDisabled();
    expect(within(rows[1]!).getByRole('button', { name: 'Assign Bo Busy' })).toHaveAccessibleDescription(
      /Busy 10 Nov 2026/,
    );

    expect(within(rows[2]!).getByText(/Does not have network engineering/)).toBeInTheDocument();
    expect(within(rows[2]!).getByRole('button', { name: 'Assign Nina Nospice' })).toBeDisabled();
  });

  it('searches by name or skill through the API', async () => {
    const queries: (string | null)[] = [];
    useBoard([
      http.get('*/api/positions/pos-1/candidates', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        queries.push(q);
        return HttpResponse.json(page(q === 'zzz' ? [] : candidates));
      }),
    ]);
    const dialog = await openDrawer();
    await within(dialog).findByRole('list', { name: 'Technicians' });
    await userEvent.type(within(dialog).getByLabelText('Search by name or skill'), 'zzz');
    expect(await within(dialog).findByText('No technicians found')).toBeInTheDocument();
    expect(queries).toContain('zzz');
  });

  it('shows loading and error states for the technician list, with retry', async () => {
    let calls = 0;
    useBoard([
      http.get('*/api/positions/pos-1/candidates', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(apiError('INTERNAL', 'Database is down.'), { status: 500 })
          : HttpResponse.json(page(candidates));
      }),
    ]);
    const dialog = await openDrawer();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Database is down.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByRole('button', { name: 'Assign Priya Rao' })).toBeInTheDocument();
  });

  it('updates the card at once (optimistic) and keeps the result when the API accepts', async () => {
    useBoard([
      http.post('*/api/positions/pos-1/assignments', async () => {
        await delay(500);
        return HttpResponse.json(
          {
            id: 'real-1',
            positionId: 'pos-1',
            technicianId: 'free',
            startDate: '2026-11-03',
            endDate: '2026-11-14',
            createdAt: 'now',
          },
          { status: 201 },
        );
      }),
    ]);
    const dialog = await openDrawer();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Assign Priya Rao' }));

    const card = document.querySelector<HTMLElement>('[data-id="pos-1"]')!;
    await waitFor(() => expect(within(card).getByText('Priya Rao')).toBeInTheDocument());
    expect(within(card).getByText('1 of 2 seats open')).toBeInTheDocument();

    expect(await screen.findByText(/Priya Rao assigned to Frankfurt DC-2/)).toBeInTheDocument();
  });

  it('rolls back cleanly and explains inline when the API answers 409', async () => {
    const message =
      'Priya Rao is already booked as network-engineering on Singapore Core from 10 Nov 2026 to 20 Nov 2026. They are next free on 21 Nov 2026.';
    useBoard([
      http.post('*/api/positions/pos-1/assignments', async () => {
        await delay(500);
        return HttpResponse.json(apiError('ASSIGNMENT_OVERLAP', message), { status: 409 });
      }),
    ]);
    const dialog = await openDrawer();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Assign Priya Rao' }));

    const card = document.querySelector<HTMLElement>('[data-id="pos-1"]')!;
    await waitFor(() => expect(within(card).getByText('Priya Rao')).toBeInTheDocument());

    await waitFor(() => expect(within(card).queryByText('Priya Rao')).not.toBeInTheDocument());
    expect(within(card).getByText('2 of 2 seats open')).toBeInTheDocument();

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Could not assign Priya Rao.');
    expect(
      await screen.findByText(/Could not assign Priya Rao/, { selector: '.MuiSnackbar-root *' }),
    ).toBeInTheDocument();
  });

  it('keeps the refusal readable after the refresh removes the person from the list, and lets it be dismissed', async () => {
    let busyNow = false;
    server.use(
      positionsHandler([target]),
      http.get('*/api/positions/pos-1/candidates', () => HttpResponse.json(page(busyNow ? [] : candidates))),
      http.post('*/api/positions/pos-1/assignments', () => {
        busyNow = true;
        return HttpResponse.json(apiError('ASSIGNMENT_OVERLAP', 'Priya Rao is already booked elsewhere.'), {
          status: 409,
        });
      }),
    );
    const dialog = await openDrawer();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Assign Priya Rao' }));
    const banner = await within(dialog).findByRole('alert');
    expect(banner).toHaveTextContent('Priya Rao is already booked elsewhere.');
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: 'Assign Priya Rao' })).not.toBeInTheDocument(),
    );
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    await userEvent.click(within(banner).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument());
  });

  it('closes the drawer after filling the last seat', async () => {
    server.use(
      positionsHandler([position({ id: 'pos-1', headcount: 1, seatsRemaining: 1 })]),
      http.get('*/api/positions/pos-1/candidates', () => HttpResponse.json(page(candidates))),
      http.post('*/api/positions/pos-1/assignments', () =>
        HttpResponse.json(
          {
            id: 'real-1',
            positionId: 'pos-1',
            technicianId: 'free',
            startDate: '2026-11-03',
            endDate: '2026-11-14',
            createdAt: 'now',
          },
          { status: 201 },
        ),
      ),
    );
    const dialog = await openDrawer();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Assign Priya Rao' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
  });
});

describe('keyboard use', () => {
  it('opens from the keyboard, moves between people with the arrow keys, and Escape returns focus to the card button', async () => {
    useBoard([
      http.get('*/api/positions/pos-1/candidates', () =>
        HttpResponse.json(
          page([
            candidate({ id: 'a', name: 'Ann A' }),
            candidate({ id: 'b', name: 'Ben B' }),
            candidate({
              id: 'c',
              name: 'Cy C',
              available: false,
              conflict: {
                assignmentId: 'x',
                positionId: 'p',
                projectName: 'Other',
                skill: 'network-engineering',
                startDate: '2026-11-03',
                endDate: '2026-11-14',
              },
            }),
          ]),
        ),
      ),
    ]);
    const user = userEvent.setup();
    renderApp();
    const opener = await screen.findByRole('button', { name: /^Assign technician/ });
    opener.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', { name: 'Assign technician', hidden: true });
    await within(dialog).findByRole('button', { name: 'Assign Ann A' });
    expect(screen.getByLabelText('Search by name or skill')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Assign Ann A', hidden: true })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Assign Ben B', hidden: true })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Assign Ann A', hidden: true })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: 'Assign Ben B', hidden: true })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: /^Assign technician/ })).toHaveFocus());
  });
});

describe('unassign', () => {
  const withPerson = position({
    id: 'pos-1',
    headcount: 1,
    seatsRemaining: 0,
    filled: true,
    assigned: [{ assignmentId: 'a1', technicianId: 't1', name: 'Priya Rao', active: true }],
  });
  const reopened = { ...withPerson, assigned: [], seatsRemaining: 1, filled: false };

  it('reopens the seat at once, then moves the position to the open column when the server agrees', async () => {
    let removed = false;
    server.use(
      positionsHandler(() => [removed ? reopened : withPerson]),
      http.delete('*/api/positions/pos-1/assignments/a1', async () => {
        await delay(600);
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/?tab=filled');
    await userEvent.click(await screen.findByRole('button', { name: /Unassign Priya Rao/ }));

    const filled = await screen.findByRole('tabpanel', { name: /^filled/i });
    expect(await within(filled).findByText('1 of 1 seat open')).toBeInTheDocument();
    expect(removed).toBe(false);

    await waitFor(() => expect(removed).toBe(true));
    expect(await screen.findByRole('tab', { name: 'Open (1)' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Filled (0)' })).toBeInTheDocument();
  });

  it('puts the person back and says why when the API refuses', async () => {
    server.use(
      positionsHandler([withPerson]),
      http.delete('*/api/positions/pos-1/assignments/a1', () =>
        HttpResponse.json(apiError('INTERNAL', 'Could not reach the database.'), { status: 500 }),
      ),
    );
    renderApp('/?tab=filled');
    await userEvent.click(await screen.findByRole('button', { name: /Unassign Priya Rao/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the database.');
    const filled = await screen.findByRole('tabpanel', { name: /^filled/i });
    expect(await within(filled).findByText('Priya Rao')).toBeInTheDocument();
    expect(within(filled).getByText('All 1 seat filled')).toBeInTheDocument();
  });
});

describe('undo after unassigning', () => {
  const withPerson = position({
    id: 'pos-1',
    headcount: 1,
    seatsRemaining: 0,
    filled: true,
    assigned: [{ assignmentId: 'a1', technicianId: 't1', name: 'Priya Rao', active: true }],
  });

  it('offers Undo in the toast, and assigns the person again when it is pressed', async () => {
    let assigned = true;
    const posts: unknown[] = [];
    server.use(
      positionsHandler(() => [
        assigned ? withPerson : { ...withPerson, assigned: [], seatsRemaining: 1, filled: false },
      ]),
      http.delete('*/api/positions/pos-1/assignments/a1', () => {
        assigned = false;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/positions/pos-1/assignments', async ({ request }) => {
        posts.push(await request.json());
        assigned = true;
        return HttpResponse.json(
          {
            id: 'a2',
            positionId: 'pos-1',
            technicianId: 't1',
            startDate: '2026-11-03',
            endDate: '2026-11-14',
            createdAt: 'now',
          },
          { status: 201 },
        );
      }),
    );
    renderApp('/?tab=filled');
    await userEvent.click(await screen.findByRole('button', { name: /Unassign Priya Rao/ }));
    const undo = await screen.findByRole('button', { name: 'Undo' });
    expect(
      within(undo.closest('.MuiSnackbar-root') as HTMLElement).getByText(/Priya Rao was unassigned/),
    ).toBeInTheDocument();

    await userEvent.click(undo);
    await waitFor(() => expect(posts).toEqual([{ technicianId: 't1' }]));
    expect(await screen.findByText('Priya Rao is assigned again.')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Filled (1)' })).toBeInTheDocument();
  });

  it('explains when putting them back is no longer allowed', async () => {
    server.use(
      positionsHandler([withPerson]),
      http.delete('*/api/positions/pos-1/assignments/a1', () => new HttpResponse(null, { status: 204 })),
      http.post('*/api/positions/pos-1/assignments', () =>
        HttpResponse.json(apiError('ASSIGNMENT_OVERLAP', 'Priya Rao is already booked on Singapore Core.'), {
          status: 409,
        }),
      ),
    );
    renderApp('/?tab=filled');
    await userEvent.click(await screen.findByRole('button', { name: /Unassign Priya Rao/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(
      await screen.findByText(/Could not put Priya Rao back\. Priya Rao is already booked on Singapore Core\./),
    ).toBeInTheDocument();
  });
});

describe('a long technician list stays short and pinned', () => {
  const sixty = Array.from({ length: 60 }, (_, i) =>
    candidate({ id: `c${i}`, name: `Person ${String(i).padStart(2, '0')}` }),
  );

  function useCandidates(onRequest: (url: URL) => void = () => undefined) {
    server.use(
      positionsHandler([target]),
      http.get('*/api/positions/pos-1/candidates', ({ request }) => {
        const url = new URL(request.url);
        onRequest(url);
        const size = Number(url.searchParams.get('pageSize'));
        return HttpResponse.json({
          data: sixty.slice(0, size),
          page: 1,
          pageSize: size,
          total: sixty.length,
          totalPages: Math.ceil(sixty.length / size),
        });
      }),
    );
  }

  it('asks only for people who can take the position by default, and says how many', async () => {
    const urls: URL[] = [];
    useCandidates((u) => urls.push(u));
    const dialog = await openDrawer();
    expect(await within(dialog).findByText('60 people can take this position')).toBeInTheDocument();
    expect(urls[0]?.searchParams.get('assignableOnly')).toBe('true');
    expect(urls[0]?.searchParams.get('pageSize')).toBe('25');
    expect(within(dialog).getByRole('switch', { name: /Only people who can take this position/ })).toBeChecked();
  });

  it('shows 25 rows with a count, and loads 25 more on request', async () => {
    const sizes: string[] = [];
    useCandidates((u) => sizes.push(u.searchParams.get('pageSize') ?? ''));
    const dialog = await openDrawer();
    expect(await within(dialog).findByText('Showing 25 of 60')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: /^Assign Person/ })).toHaveLength(25);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show 25 more' }));
    expect(await within(dialog).findByText('Showing 50 of 60')).toBeInTheDocument();
    expect(sizes).toContain('50');
  });

  it('lets the coordinator switch to everyone, and searching always shows everyone matching', async () => {
    const urls: URL[] = [];
    useCandidates((u) => urls.push(u));
    const dialog = await openDrawer();
    await within(dialog).findByText('60 people can take this position');

    await userEvent.click(within(dialog).getByRole('switch', { name: /Only people who can take this position/ }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.has('assignableOnly')).toBe(false));
    expect(await within(dialog).findByText(/60 technicians, people who can take it first/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('switch', { name: /Only people who can take this position/ }));
    await userEvent.type(within(dialog).getByLabelText('Search by name or skill'), 'person 07');
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('q')).toBe('person 07'));
    expect(urls.at(-1)?.searchParams.has('assignableOnly')).toBe(false);
    expect(within(dialog).getByRole('switch', { name: /Only people who can take this position/ })).toBeDisabled();
  });

  it('offers to show everyone when nobody can take the position', async () => {
    const urls: URL[] = [];
    server.use(
      positionsHandler([target]),
      http.get('*/api/positions/pos-1/candidates', ({ request }) => {
        const url = new URL(request.url);
        urls.push(url);
        return HttpResponse.json(url.searchParams.get('assignableOnly') ? page([]) : page(candidates));
      }),
    );
    const dialog = await openDrawer();
    expect(await within(dialog).findByText('Nobody is free for this position')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show everyone' }));
    expect(await within(dialog).findByRole('button', { name: 'Assign Priya Rao' })).toBeInTheDocument();
  });
});
