import { createAction } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { throttledFocusListeners } from '../src/shared/focusListeners.ts';

// RTK does not export its focus and online action creators, and the handler receives them as an argument, so
// these stand-ins are enough to see what it dispatches.
const onFocus = createAction('test/focus');
const onFocusLost = createAction('test/focusLost');
const onOnline = createAction('test/online');
const onOffline = createAction('test/offline');
const actions = { onFocus, onFocusLost, onOnline, onOffline } as unknown as Parameters<
  ReturnType<typeof throttledFocusListeners>
>[1];

function setup(minGapMs = 30_000) {
  let clock = 1_000_000;
  const dispatch = vi.fn();
  const stop = throttledFocusListeners(minGapMs, () => clock)(dispatch, actions);
  const advance = (ms: number) => (clock += ms);
  const focus = () => window.dispatchEvent(new Event('focus'));
  const focusCount = () => dispatch.mock.calls.filter(([a]) => a.type === onFocus.type).length;
  return { dispatch, stop, advance, focus, focusCount };
}

describe('throttledFocusListeners', () => {
  let stop: (() => void) | undefined;
  afterEach(() => stop?.());

  it('lets ten quick tab switches through as one refetch', () => {
    const t = setup();
    stop = t.stop;
    for (let i = 0; i < 10; i++) {
      t.advance(5_000);
      t.focus();
    }
    // 50 seconds in: the first focus after 30 seconds passes, the rest fall inside the next gap.
    expect(t.focusCount()).toBe(1);
  });

  it('ignores focus right after page load', () => {
    const t = setup();
    stop = t.stop;
    t.advance(1_000);
    t.focus();
    expect(t.focusCount()).toBe(0);
  });

  it('refetches again once the gap has passed', () => {
    const t = setup();
    stop = t.stop;
    t.advance(31_000);
    t.focus();
    t.advance(31_000);
    t.focus();
    expect(t.focusCount()).toBe(2);
  });

  it('never throttles going back online', () => {
    const t = setup();
    stop = t.stop;
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    expect(t.dispatch.mock.calls.filter(([a]) => a.type === onOnline.type)).toHaveLength(2);
  });

  it('removes its listeners when stopped', () => {
    const t = setup();
    t.stop();
    t.advance(60_000);
    t.focus();
    expect(t.dispatch).not.toHaveBeenCalled();
  });
});
