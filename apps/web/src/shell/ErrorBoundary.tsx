import { Component, type ReactNode } from 'react';
import { messagesFor } from '../i18n';

interface State {
  readonly failed: boolean;
  readonly path: string;
}

/** Keeps one broken screen from wiping the whole app (TTD-AUD-30). */
export class ScreenBoundary extends Component<
  { readonly children: ReactNode; readonly resetKey?: string },
  State
> {
  override state: State = { failed: false, path: '' };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { readonly resetKey?: string },
    state: State,
  ): Partial<State> | null {
    const path = props.resetKey ?? '';
    if (state.failed && path !== state.path) {
      return { failed: false, path };
    }
    if (path !== state.path) {
      return { path };
    }
    return null;
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    const messages = messagesFor(document.documentElement.lang || 'es');
    return (
      <main className="screen-page screen-crash">
        <h1>{messages.screenCrashTitle}</h1>
        <button
          type="button"
          className="ui-button is-primary is-md"
          onClick={() => {
            this.setState({ failed: false });
            window.location.assign('/today');
          }}
        >
          {messages.screenCrashBack}
        </button>
      </main>
    );
  }
}
