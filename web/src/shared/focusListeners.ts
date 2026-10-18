import type { setupListeners } from '@reduxjs/toolkit/query';

type ListenerHandler = NonNullable<Parameters<typeof setupListeners>[1]>;

export const FOCUS_REFETCH_GAP_MS = 30_000;

/**
 * RTK Query refetches every active query on each focus event, with no minimum gap. Switching tabs ten times
 * would send ten rounds of requests. This handler passes a focus event on only when the last one was at least
 * `minGapMs` ago, counting from page load, since the first screen has just fetched. Going back online is
 * rare and means the data is probably stale, so it is never throttled.
 *
 * A focus event that is held back is not sent at all, so RTK's own "focused" flag can be out of date. Nothing
 * here may rely on it, which is why polling pauses with usePageVisible and not skipPollingIfUnfocused.
 */
export function throttledFocusListeners(
  minGapMs = FOCUS_REFETCH_GAP_MS,
  now: () => number = Date.now,
): ListenerHandler {
  return (dispatch, { onFocus, onFocusLost, onOnline, onOffline }) => {
    let lastRefetch = now();

    const handleFocus = () => {
      const t = now();
      if (t - lastRefetch < minGapMs) return;
      lastRefetch = t;
      dispatch(onFocus());
    };
    const handleVisibilityChange = () => {
      if (window.document.visibilityState === 'visible') handleFocus();
      else dispatch(onFocusLost());
    };
    const handleOnline = () => dispatch(onOnline());
    const handleOffline = () => dispatch(onOffline());

    window.addEventListener('visibilitychange', handleVisibilityChange, false);
    window.addEventListener('focus', handleFocus, false);
    window.addEventListener('online', handleOnline, false);
    window.addEventListener('offline', handleOffline, false);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  };
}
