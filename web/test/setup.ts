import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server.ts';

window.matchMedia = (query: string) => {
  const evaluate = () => {
    if (query.includes('prefers-reduced-motion')) return true;
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    if (min && window.innerWidth < Number(min[1])) return false;
    if (max && window.innerWidth > Number(max[1])) return false;
    return Boolean(min ?? max);
  };
  return {
    get matches() {
      return evaluate();
    },
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
};

const scope = globalThis as { ResizeObserver?: typeof ResizeObserver };
scope.ResizeObserver ??= class implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.innerWidth = 1280;

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  server.resetHandlers();
});
afterAll(() => server.close());
