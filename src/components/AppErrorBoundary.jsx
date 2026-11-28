import { Component } from 'react';
import { logFailure } from '../services/diagnostics.js';

export default class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    logFailure('ui.render');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-shell" aria-label="Page recovery">
        <section className="page-content" role="alert">
          <h1>EcoPulse couldn’t load this page</h1>
          <p>Try loading it again, or return to Chat.</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
          <a className="btn-secondary" href="/">Return to Chat</a>
        </section>
      </main>
    );
  }
}
