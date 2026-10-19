import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '../shared/ui.tsx';

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorState
        message="This screen hit an unexpected problem. Reloading usually fixes it."
        onRetry={() => window.location.reload()}
      />
    );
  }
}
