import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps a route/render failure recoverable instead of leaving an empty #root. */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep diagnostics in the local developer console without rendering secrets
    // or persisting exception details in user data.
    console.error("NeuroQuiz UI error", error, info.componentStack);
  }

  private recover = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="error-page" role="alert">
        <div className="card error-card">
          <span className="eyebrow">NeuroQuiz recovery</span>
          <h1>This study screen could not be displayed</h1>
          <p className="muted">
            Your local books and progress are still stored in this browser. Try the recovery actions below;
            refreshing is safe unless an exam is actively being saved.
          </p>
          <div className="row">
            <button className="primary" type="button" onClick={this.recover}>Try again</button>
            <button type="button" onClick={() => { window.location.hash = "#/"; window.location.reload(); }}>Return home</button>
            <button type="button" onClick={() => window.location.reload()}>Reload app</button>
          </div>
          <details className="small muted">
            <summary>Technical details</summary>
            <pre>{this.state.error.message || "Unknown rendering error"}</pre>
          </details>
        </div>
      </main>
    );
  }
}
