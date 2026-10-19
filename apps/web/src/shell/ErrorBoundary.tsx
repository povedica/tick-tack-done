import { Component, type ReactNode } from 'react';

interface State {
  readonly failed: boolean;
}

/** Keeps one broken screen from wiping the whole app. */
export class ScreenBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <main className="screen-page">
        <h1>No se ha podido mostrar esta pantalla</h1>
        <button
          type="button"
          onClick={() => {
            window.location.assign('/today');
          }}
        >
          Volver a Hoy
        </button>
      </main>
    );
  }
}
