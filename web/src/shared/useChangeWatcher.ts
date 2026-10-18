import { useEffect, useRef } from 'react';
import { useAppDispatch } from '../app/hooks.ts';
import { api, useGetChangesQuery } from './api.ts';
import { usePageVisible } from './usePageVisible.ts';

export const CHANGE_POLL_MS = 10_000;

/**
 * Keeps the board current without refetching on a timer. The API keeps one number that moves whenever anything
 * on the board is written, whether by another coordinator, a sync or an HR webhook. This polls that number,
 * which is a tiny request, and only when it differs from the last one seen does it refetch the real data.
 * The first answer is just the starting point, since the screen has loaded its data a moment before.
 *
 * Your own changes move the number too, so the poll after one of them refreshes the board once more. That is
 * harmless: the data is already right and the refetch returns the same thing.
 */
export function useChangeWatcher(everyMs: number = CHANGE_POLL_MS): void {
  const dispatch = useAppDispatch();
  const visible = usePageVisible();
  const { data, refetch } = useGetChangesQuery(undefined, { pollingInterval: visible ? everyMs : 0 });

  const lastSeen = useRef<number | undefined>(undefined);
  const version = data?.version;
  useEffect(() => {
    if (version === undefined) return;
    if (lastSeen.current !== undefined && lastSeen.current !== version) {
      dispatch(api.util.invalidateTags(['Positions', 'Candidates']));
    }
    lastSeen.current = version;
  }, [version, dispatch]);

  // A hidden tab does not poll, so look straight away when it comes back instead of waiting a full interval.
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) void refetch();
    wasVisible.current = visible;
  }, [visible, refetch]);
}
