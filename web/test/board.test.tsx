import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '@crew-board/shared';
import { position, positionsHandler, positionsResponse, recordRequests, renderApp, summaryOf } from './helpers.tsx';
import { server } from './server.ts';

const positions = [
  position({
    id: 'open-1',
    projectName: 'Frankfurt DC-2',
    headcount: 2,
    seatsRemaining: 1,
    assigned: [{ assignmentId: 'a1', technicianId: 't1', name: 'Priya Rao', active: true }],
  }),
  position({
    id: 'full-1',
    projectName: 'Dublin Hall B',
    skill: 'fibre-cabling',
    headcount: 1,
    seatsRemaining: 0,
    filled: true,
    assigned: [{ assignmentId: 'a2', technicianId: 't2', name: 'Sam Lee', active: false }],
  }),
];

const today = () => new Date().toISOString().slice(0, 10);
const openPanel = () => screen.findByRole('tabpanel', { name: /^open/i });
const filledPanel = () => screen.findByRole('tabpanel', { name: /^filled/i });

afterEach(() => {
  window.innerWidth = 1280;
});

describe('project board', () => {
  it('shows a loading state, then the open positions as rows with dates, seats and people', async () => {
    server.use(positionsHandler(positions));
    renderApp();
    expect(screen.getByRole('status', { name: 'Loading open positions' })).toBeInTheDocument();

    const panel = await openPanel();
    expect(await within(panel).findByText('Frankfurt DC-2')).toBeInTheDocument();
    expect(within(panel).getByText('1 of 2 seats open')).toBeInTheDocument();
    expect(within(panel).getByText('Priya Rao')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /^Assign technician to Frankfurt DC-2/ })).toBeInTheDocument();
    expect(within(panel).queryByText('Dublin Hall B')).not.toBeInTheDocument();
  });

  it('puts filled positions on their own tab, with the deactivated person flagged', async () => {
    server.use(positionsHandler(positions));
    renderApp('/?tab=filled');
    const panel = await filledPanel();
    expect(await within(panel).findByText('Dublin Hall B')).toBeInTheDocument();
    expect(within(panel).getByText('All 1 seat filled')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Deactivated by HR')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /^Assign technician to/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /^Manage people on Dublin Hall B/ })).toBeInTheDocument();
  });

  it('shows the exact seats still to fill in the pinned header', async () => {
    server.use(positionsHandler(positions));
    renderApp();
    await screen.findByText('Frankfurt DC-2');
    await waitFor(() => expect(screen.getByText('seats to fill').previousSibling).toHaveTextContent('1'));
  });

  it('asks on landing only for what the first screen shows', async () => {
    server.use(positionsHandler(positions));
    const urls = recordRequests();
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    expect(await screen.findByRole('tab', { name: 'Filled (1)' })).toBeInTheDocument();

    const filledSizes = urls()
      .filter((u) => u.pathname === '/api/positions' && u.searchParams.get('status') === 'filled')
      .map((u) => u.searchParams.get('pageSize'));
    expect(filledSizes).toEqual(['1']);
    expect(
      urls()
        .filter((u) => u.pathname === '/api/sync/runs')
        .map((u) => u.searchParams.get('limit')),
    ).toEqual(['1']);
    expect(screen.queryByRole('heading', { name: 'HR sync' })).not.toBeInTheDocument();
  });

  it('loads the filled rows the first time that tab is opened, and not before', async () => {
    server.use(positionsHandler(positions));
    const urls = recordRequests();
    renderApp();
    await userEvent.click(await screen.findByRole('tab', { name: 'Filled (1)' }));
    expect(await within(await filledPanel()).findByText('Dublin Hall B')).toBeInTheDocument();

    const filledSizes = urls()
      .filter((u) => u.pathname === '/api/positions' && u.searchParams.get('status') === 'filled')
      .map((u) => u.searchParams.get('pageSize'));
    expect(filledSizes).toHaveLength(2);
    expect(filledSizes[0]).toBe('1');
    expect(filledSizes[1]).not.toBe('1');
  });

  it('shows an empty state when there are no positions at all', async () => {
    server.use(positionsHandler([]));
    renderApp();
    expect(await screen.findByText('No positions yet')).toBeInTheDocument();
  });

  it('shows an error state with a retry that recovers, on the tab that failed', async () => {
    let failed = false;
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('status') === 'open' && !failed) {
          failed = true;
          return HttpResponse.json(
            { error: { code: 'INTERNAL', message: 'Something went wrong on our side.', requestId: 'r1' } },
            { status: 500 },
          );
        }
        return HttpResponse.json(positionsResponse(positions, url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(positions))),
    );
    renderApp();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong on our side.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(await openPanel()).findByText('Frankfurt DC-2')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so plainly when the server cannot be reached', async () => {
    server.use(
      http.get(/\/api\/positions$/, () => HttpResponse.error()),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(positions))),
    );
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  it('marks an open position that starts soon as urgent', async () => {
    const soon = position({ id: 'soon', startDate: addDays(today(), 5), endDate: addDays(today(), 12) });
    server.use(positionsHandler([soon]));
    renderApp();
    expect(await within(await openPanel()).findByText(/Starts in 5 days/)).toHaveTextContent('⚠');
  });
});

describe('search, sort and filters', () => {
  const sortRequests = () => {
    const seen: URL[] = [];
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        return HttpResponse.json(positionsResponse(positions, url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(positions))),
    );
    return seen;
  };

  it('sorts from the Sort menu', async () => {
    const seen = sortRequests();
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    expect(screen.getByRole('button', { name: /Sort: Soonest start/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sort: Soonest start/ }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Most seats open' }));
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('sort')).toBe('seats'));
    expect(screen.getByRole('button', { name: /Sort: Most seats open/ })).toBeInTheDocument();
  });

  it('sorts from a column header, and the Sort menu follows', async () => {
    const seen = sortRequests();
    renderApp('/?sort=seats');
    const panel = await openPanel();
    await within(panel).findByText('Frankfurt DC-2');
    expect(within(panel).getByRole('columnheader', { name: /Seats/ })).toHaveAttribute('aria-sort', 'descending');

    await userEvent.click(within(panel).getByRole('columnheader', { name: /Dates/ }));
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('sort')).toBe('start'));
    expect(await screen.findByRole('button', { name: /Sort: Soonest start/ })).toBeInTheDocument();
    expect(within(panel).getByRole('columnheader', { name: /Dates/ })).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(within(panel).getByRole('columnheader', { name: /Dates/ }));
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('sort')).toBe('start-desc'));
    expect(await screen.findByRole('button', { name: /Sort: Latest start/ })).toBeInTheDocument();
  });

  it('keeps the sort in the address, so a shared link opens the same view', async () => {
    server.use(positionsHandler(positions));
    renderApp('/?sort=project');
    expect(await screen.findByRole('button', { name: /Sort: Project A to Z/ })).toBeInTheDocument();
  });

  it('puts skill and dates behind a Filters button, shows them as removable pills, and counts them', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        return HttpResponse.json(positionsResponse(url.searchParams.get('skill') ? [] : positions, url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(positions))),
    );
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    expect(screen.queryByLabelText('Skill')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filter positions' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Skill'), 'fibre-cabling');
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('skill')).toBe('fibre-cabling'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    const pills = await screen.findByRole('list', { name: 'Active filters' });
    expect(within(pills).getByText('Skill: Fibre cabling')).toBeInTheDocument();
    expect(await within(await openPanel()).findByText('No positions match')).toBeInTheDocument();

    await userEvent.click(within(pills).getByRole('button', { name: /Remove filter: Skill/ }));
    expect(await within(await openPanel()).findByText('Frankfurt DC-2')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('warns when the date range is back to front', async () => {
    server.use(positionsHandler(positions));
    renderApp('/?from=2026-11-10&to=2026-11-01');
    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filter positions' });
    expect(within(dialog).getByText(/end date is before the start date/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Running until')).toBeInvalid();
  });

  it('searches by project or skill after a short pause, and offers to clear when nothing matches', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        return HttpResponse.json(positionsResponse(url.searchParams.get('q') === 'zzz' ? [] : positions, url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(positions))),
    );
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    await userEvent.type(screen.getByRole('searchbox', { name: /Search positions/ }), 'zzz');
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('q')).toBe('zzz'));
    const emptyPanel = await openPanel();
    expect(await within(emptyPanel).findByText('No positions match')).toBeInTheDocument();
    await userEvent.click(within(emptyPanel).getByRole('button', { name: 'Clear filters and search' }));
    expect(await within(await openPanel()).findByText('Frankfurt DC-2')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /Search positions/ })).toHaveValue('');
  });
});

describe('more filters', () => {
  const capture = () => {
    const seen: URL[] = [];
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        return HttpResponse.json(positionsResponse(positions, url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(positions))),
    );
    return seen;
  };
  const openFilters = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    return screen.findByRole('dialog', { name: 'Filter positions' });
  };

  it('filters by who is assigned, applied when the name is finished', async () => {
    const seen = capture();
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    const dialog = await openFilters();
    const field = within(dialog).getByLabelText('Assigned to');
    await userEvent.type(field, 'priya');
    expect(seen.some((u) => u.searchParams.has('assignee'))).toBe(false);
    await userEvent.type(field, '{Enter}');
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('assignee')).toBe('priya'));
    expect(await screen.findByText('Assigned to “priya”')).toBeInTheDocument();
  });

  it('filters by staffing, open seats, start window and replacements, each as a removable pill', async () => {
    const seen = capture();
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    const dialog = await openFilters();

    await userEvent.selectOptions(within(dialog).getByLabelText('Staffing'), 'none');
    await userEvent.selectOptions(within(dialog).getByLabelText('Seats still open'), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Starts within 14 days' }));
    await userEvent.click(within(dialog).getByRole('switch', { name: /Needs a replacement/ }));
    await waitFor(() => {
      const last = seen.at(-1)!.searchParams;
      expect(last.get('staffing')).toBe('none');
      expect(last.get('minSeats')).toBe('2');
      expect(last.get('startsWithin')).toBe('14');
      expect(last.get('needsReplacement')).toBe('true');
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    const pills = await screen.findByRole('list', { name: 'Active filters' });
    for (const text of ['No one assigned yet', '2+ seats open', 'Starts within 14 days', 'Needs a replacement'])
      expect(within(pills).getByText(text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' }).closest('.MuiBadge-root')).toHaveTextContent('4');

    await userEvent.click(within(pills).getByRole('button', { name: 'Remove filter: 2+ seats open' }));
    expect(
      within(screen.getByRole('list', { name: 'Active filters' })).queryByText('2+ seats open'),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('list', { name: 'Active filters' })).getByRole('button', { name: 'Clear all' }),
    );
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('opens a shared link with all its filters applied', async () => {
    const seen = capture();
    renderApp('/?assignee=ann&staffing=some&replace=1&seats=3&within=7&skill=fibre-cabling');
    await screen.findByRole('list', { name: 'Active filters' });
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const q = seen[0]!.searchParams;
    expect([
      q.get('assignee'),
      q.get('staffing'),
      q.get('needsReplacement'),
      q.get('minSeats'),
      q.get('startsWithin'),
      q.get('skill'),
    ]).toEqual(['ann', 'some', 'true', '3', '7', 'fibre-cabling']);
    expect(screen.getByRole('button', { name: 'Filters' }).closest('.MuiBadge-root')).toHaveTextContent('6');
  });

  it('ignores nonsense in the address instead of breaking', async () => {
    const seen = capture();
    renderApp('/?staffing=maybe&seats=abc&within=-4&replace=yes&skill=juggling');
    await within(await openPanel()).findByText('Frankfurt DC-2');
    const q = seen[0]!.searchParams;
    for (const key of ['staffing', 'minSeats', 'startsWithin', 'needsReplacement', 'skill'])
      expect(q.has(key)).toBe(false);
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument();
  });
});

describe('pagination', () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    position({
      id: `p${String(i).padStart(2, '0')}`,
      projectName: `Project ${String(i).padStart(2, '0')}`,
      headcount: 1,
      seatsRemaining: 1,
    }),
  );

  function serveMany(requests: URL[] = []) {
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return HttpResponse.json(positionsResponse(many, url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(many))),
    );
  }

  it('shows one page at a time with the real total, and loads the next page from the server', async () => {
    const requests: URL[] = [];
    serveMany(requests);
    renderApp();
    const panel = await openPanel();
    expect(await within(panel).findByText('Project 00')).toBeInTheDocument();
    expect(within(panel).getByText('1–25 of 60')).toBeInTheDocument();
    expect(within(panel).queryByText('Project 25')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open (60)' })).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Go to next page' }));
    expect(await within(panel).findByText('Project 25')).toBeInTheDocument();
    expect(within(panel).getByText('26–50 of 60')).toBeInTheDocument();
    expect(requests.some((u) => u.searchParams.get('status') === 'open' && u.searchParams.get('page') === '2')).toBe(
      true,
    );

    await userEvent.click(within(panel).getByRole('button', { name: 'Go to next page' }));
    expect(await within(panel).findByText('Project 50')).toBeInTheDocument();
    expect(within(panel).getByText('51–60 of 60')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  });

  it('lets the page size change and goes back to page one', async () => {
    const requests: URL[] = [];
    serveMany(requests);
    renderApp();
    const panel = await openPanel();
    await within(panel).findByText('Project 00');
    await userEvent.click(within(panel).getByRole('button', { name: 'Go to next page' }));
    await within(panel).findByText('Project 25');

    const pageSize = within(panel).getByRole('combobox', { name: /Rows per page/, hidden: true });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(pageSize);
    await userEvent.click(await screen.findByRole('option', { name: '50' }));
    expect(await within(panel).findByText('1–50 of 60')).toBeInTheDocument();
    expect(requests.some((u) => u.searchParams.get('pageSize') === '50' && u.searchParams.get('page') === '1')).toBe(
      true,
    );
  });

  it('returns to the first page when the sort changes', async () => {
    serveMany();
    renderApp();
    const panel = await openPanel();
    await within(panel).findByText('Project 00');
    await userEvent.click(within(panel).getByRole('button', { name: 'Go to next page' }));
    await within(panel).findByText('26–50 of 60');
    await userEvent.click(within(panel).getByRole('columnheader', { name: /Dates/ }));
    expect(await within(panel).findByText('1–25 of 60')).toBeInTheDocument();
  });

  it('refreshes when the window regains focus, and steps back if the page it was on no longer exists', async () => {
    let rows = many;
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => HttpResponse.json(positionsResponse(rows, new URL(request.url)))),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(rows))),
    );
    renderApp();
    const panel = await openPanel();
    await within(panel).findByText('Project 00');
    await userEvent.click(within(panel).getByRole('button', { name: 'Go to next page' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Go to next page' }));
    await within(panel).findByText('Project 50');

    rows = many.slice(0, 20);
    window.dispatchEvent(new Event('focus'));
    expect(await within(panel).findByText('1–20 of 20', {}, { timeout: 6000 })).toBeInTheDocument();
    expect(await within(panel).findByText('Project 00')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Open (20)' })).toBeInTheDocument();
  }, 20_000);
});

describe('keyboard use of the table', () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    position({ id: `k${i}`, projectName: `Project ${String(i).padStart(2, '0')}` }),
  );

  it('has a skip link that jumps past the rows to the page controls, and its name contains its visible text', async () => {
    server.use(positionsHandler(many));
    renderApp();
    const panel = await openPanel();
    await within(panel).findByText('Project 00');
    const skip = within(panel).getByRole('button', { name: 'Skip to page controls' });
    await userEvent.click(skip);
    expect(within(panel).getByRole('button', { name: 'Go to next page' })).toHaveFocus();
  });

  it('gives the "+N more" chip an accessible name that starts with what is shown', async () => {
    const crowd = position({
      id: 'crowd2',
      projectName: 'Crowd Site',
      assigned: ['A One', 'B Two', 'C Three'].map((name, i) => ({
        assignmentId: `c${i}`,
        technicianId: `t${i}`,
        name,
        active: true,
      })),
    });
    server.use(positionsHandler([crowd]));
    renderApp();
    const chip = await screen.findByRole('button', { name: /^\+2 more/ });
    expect(chip).toHaveTextContent('+2 more');
  });
});

describe('many people on one position', () => {
  const crowd = position({
    id: 'crowd',
    projectName: 'Mumbai DC-4',
    headcount: 4,
    seatsRemaining: 0,
    filled: true,
    assigned: ['Bella Grant', 'Ben Foster', 'Carter Baker', 'Dana Wu'].map((name, i) => ({
      assignmentId: `a${i}`,
      technicianId: `t${i}`,
      name,
      active: i !== 3,
    })),
  });

  it('shows the first person and a "+3 more" chip instead of stretching the row', async () => {
    server.use(positionsHandler([crowd]));
    renderApp('/?tab=filled');
    const panel = await filledPanel();
    expect(await within(panel).findByText('Bella Grant')).toBeInTheDocument();
    expect(within(panel).queryByText('Ben Foster')).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /show all 4 people assigned to Mumbai DC-4/ })).toHaveTextContent(
      '+3 more',
    );
  });

  it('opens a full list from the chip, with an unassign button for each person', async () => {
    let removed = false;
    server.use(
      positionsHandler(() => [
        removed ? { ...crowd, assigned: crowd.assigned.slice(1), seatsRemaining: 1, filled: false } : crowd,
      ]),
      http.delete('*/api/positions/crowd/assignments/a0', async () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/?tab=filled');
    await userEvent.click(await screen.findByRole('button', { name: /show all 4 people/ }));

    const dialog = await screen.findByRole('dialog', { name: 'People on this position' });
    const list = within(dialog).getByRole('list', { name: /All 4 people on Mumbai DC-4/ });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getByText('Deactivated by HR, find a replacement')).toBeInTheDocument();
    expect(within(dialog).getByText('4 people')).toBeInTheDocument();

    await userEvent.click(within(list).getByRole('button', { name: /Unassign Bella Grant from Mumbai DC-4/ }));
    await waitFor(() => expect(removed).toBe(true));
    await waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(3));
    expect(await within(dialog).findByRole('button', { name: 'Assign technician' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps one main button per row and a menu with three things the button does not do', async () => {
    server.use(positionsHandler([crowd]));
    renderApp('/?tab=filled');
    const panel = await filledPanel();
    expect(await within(panel).findAllByRole('button', { name: /Manage people on Mumbai DC-4/ })).toHaveLength(1);

    await userEvent.click(await screen.findByRole('button', { name: /More actions for Mumbai DC-4/ }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['More from this project', 'Copy assigned names', 'Copy position details']);
  });

  it('copies the assigned names and the position details for pasting elsewhere', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    server.use(positionsHandler([crowd]));
    renderApp('/?tab=filled');
    await userEvent.click(await screen.findByRole('button', { name: /More actions for Mumbai DC-4/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy assigned names' }));
    expect(writeText).toHaveBeenLastCalledWith('Bella Grant, Ben Foster, Carter Baker, Dana Wu');
    expect(await screen.findByText('Assigned names copied.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /More actions for Mumbai DC-4/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy position details' }));
    expect(writeText.mock.lastCall?.[0]).toMatch(
      /^Mumbai DC-4, network engineering, .* to .*, all 4 filled, assigned: Bella Grant, Ben Foster/,
    );
  });

  it('says so when the clipboard is not available', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    server.use(positionsHandler([crowd]));
    renderApp('/?tab=filled');
    await userEvent.click(await screen.findByRole('button', { name: /More actions for Mumbai DC-4/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy assigned names' }));
    expect(await screen.findByText(/Could not copy assigned names/)).toBeInTheDocument();
  });

  it('narrows the list to one project from the menu', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        return HttpResponse.json(positionsResponse([crowd, position({ id: 'other', projectName: 'Other Site' })], url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf([crowd]))),
    );
    renderApp('/?tab=filled');
    await userEvent.click(await screen.findByRole('button', { name: /More actions for Mumbai DC-4/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'More from this project' }));
    expect(screen.getByRole('searchbox', { name: /Search positions/ })).toHaveValue('Mumbai DC-4');
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('q')).toBe('Mumbai DC-4'));
  });

  it('keeps the copy actions off when there is nobody to copy', async () => {
    server.use(positionsHandler([position({ id: 'empty' })]));
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /More actions for Frankfurt DC-2/ }));
    expect(await screen.findByRole('menuitem', { name: 'Copy assigned names' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('reaches the people list from the "+N more" chip on an open position, then goes straight to assigning', async () => {
    const half = position({
      id: 'half',
      projectName: 'Half Full',
      headcount: 5,
      seatsRemaining: 2,
      assigned: ['Una Hill', 'Vic Moss', 'Wes Park'].map((name, i) => ({
        assignmentId: `h${i}`,
        technicianId: `t${i}`,
        name,
        active: true,
      })),
    });
    server.use(
      positionsHandler([half]),
      http.get('*/api/positions/half/candidates', () =>
        HttpResponse.json({ data: [], page: 1, pageSize: 25, total: 0, totalPages: 0 }),
      ),
    );
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /show all 3 people assigned to Half Full/ }));
    const people = await screen.findByRole('dialog', { name: 'People on this position' });
    await userEvent.click(within(people).getByRole('button', { name: 'Assign technician' }));
    expect(await screen.findByRole('dialog', { name: 'Assign technician' })).toBeInTheDocument();
  });
});

describe('sliding tabs and pages', () => {
  it('slides between Open and Filled: only the visible tab can be reached', async () => {
    server.use(positionsHandler(positions));
    renderApp();
    const open = await openPanel();
    expect(open).not.toHaveAttribute('aria-hidden', 'true');

    await userEvent.click(await screen.findByRole('tab', { name: 'Filled (1)' }));
    await waitFor(() => expect(document.getElementById('panel-open')).toHaveAttribute('aria-hidden', 'true'));
    expect(document.getElementById('panel-open')).toHaveAttribute('inert');
    expect(await within(await filledPanel()).findByText('Dublin Hall B')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Filled (1)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves between tabs with the arrow keys', async () => {
    server.use(positionsHandler(positions));
    renderApp();
    const tab = await screen.findByRole('tab', { name: 'Open (1)' });
    tab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('tab', { name: 'Filled (1)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('slides from the board to HR sync and back, and the board keeps its tab and sort', async () => {
    server.use(positionsHandler(positions));
    renderApp('/?tab=filled&sort=seats');
    await within(await filledPanel()).findByText('Dublin Hall B');

    await userEvent.click(screen.getByRole('link', { name: 'HR sync' }));
    await waitFor(() => expect(document.getElementById('page-board')).toHaveAttribute('aria-hidden', 'true'));
    expect(document.getElementById('page-sync')).not.toHaveAttribute('aria-hidden', 'true');
    expect(await screen.findByRole('heading', { name: 'HR sync' })).toBeInTheDocument();

    const back = screen.getByRole('link', { name: 'Board' });
    expect(back).toHaveAttribute('href', '/?tab=filled&sort=seats');
    await userEvent.click(back);
    await waitFor(() => expect(document.getElementById('page-sync')).toHaveAttribute('aria-hidden', 'true'));
    expect(screen.getByRole('tab', { name: 'Filled (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Sort: Most seats open/ })).toBeInTheDocument();
  });

  it('keeps the page title in step with the page', async () => {
    server.use(positionsHandler(positions));
    renderApp();
    await waitFor(() => expect(document.title).toBe('Board · Crew Board'));
    await userEvent.click(screen.getByRole('link', { name: 'HR sync' }));
    await waitFor(() => expect(document.title).toBe('HR sync · Crew Board'));
  });
});

describe('narrower screens', () => {
  it('moves the skill and the seats under the project name when their columns do not fit', async () => {
    window.innerWidth = 700;
    server.use(positionsHandler(positions));
    renderApp();
    const panel = await openPanel();
    expect(await within(panel).findByText('Frankfurt DC-2')).toBeInTheDocument();
    expect(within(panel).getByText('1 of 2 seats open')).toBeInTheDocument();
    expect(within(panel).getByText('network engineering')).toBeInTheDocument();
    expect(within(panel).queryByRole('columnheader', { name: 'Seats' })).not.toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('shows a not-found page for unknown routes', () => {
    renderApp('/nope');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });
});

describe('quick views, shortcut and remembered page size', () => {
  const mixed = [
    ...positions,
    position({
      id: 'open-2',
      projectName: 'Oslo Core',
      assigned: [{ assignmentId: 'a3', technicianId: 't3', name: 'Gone Away', active: false }],
    }),
  ];

  it('shows counts on quick views and applies one as a filter that a second click clears', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        return HttpResponse.json(positionsResponse(mixed, url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(mixed))),
    );
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    const group = screen.getByRole('group', { name: 'Quick views' });
    const chip = await within(group).findByRole('button', { name: /Needs replacement\s*1/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('needsReplacement')).toBe('true'));
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip);
    await waitFor(() => expect(chip).toHaveAttribute('aria-pressed', 'false'));
  });

  it('focuses the search box when / is pressed, but not while typing in a field', async () => {
    server.use(positionsHandler(positions));
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    const search = screen.getByRole('searchbox', { name: /Search positions/ });
    expect(search).toHaveAttribute('aria-keyshortcuts', '/');
    await userEvent.keyboard('/');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');
  });

  it('opens the people dialog when a row is clicked, but not when a button inside it is', async () => {
    server.use(positionsHandler(positions));
    renderApp();
    const panel = await openPanel();
    await userEvent.click(await within(panel).findByText('Frankfurt DC-2'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('remembers the page size for the next visit', async () => {
    localStorage.setItem('crewboard.pageSize', '50');
    const seen: URL[] = [];
    server.use(
      http.get(/\/api\/positions$/, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        return HttpResponse.json(positionsResponse(positions, url));
      }),
      http.get('*/api/positions/summary', () => HttpResponse.json(summaryOf(positions))),
    );
    renderApp();
    await within(await openPanel()).findByText('Frankfurt DC-2');
    expect(seen[0]?.searchParams.get('pageSize')).toBe('50');
    localStorage.removeItem('crewboard.pageSize');
  });
});
