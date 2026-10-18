import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

export const server = setupServer(
  http.get('*/api/changes', () => HttpResponse.json({ version: 0 })),
  http.get('*/api/sync/runs', () => HttpResponse.json([])),
  http.get('*/api/positions/summary', () =>
    HttpResponse.json({ openPositions: 0, filledPositions: 0, seatsToFill: 0 }),
  ),
);
