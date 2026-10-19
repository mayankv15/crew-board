import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/app/ErrorBoundary.tsx';

function Boom(): never {
  throw new Error('render failed');
}

describe('error boundary', () => {
  it('replaces a crashed screen with a message and a reload button', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('unexpected problem');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
