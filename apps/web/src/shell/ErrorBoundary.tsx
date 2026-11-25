import { Component, type ErrorInfo, type ReactNode } from 'react';
import { messagesFor } from '../i18n';
import { reportError } from '../observability/report';

interface State {
  readonly failed: boolean;
  readonly path: string;
  readonly eventId: string | null;
  readonly copied: boolean;
}

/** Keeps one broken screen from wiping the whole app (TTD-AUD-30). */
export class ScreenBoundary extends Component<
  { readonly children: ReactNode; readonly resetKey?: string },
  State
> {
  override state: State = { failed: false, path: '', eventId: null, copied: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true, eventId: null, copied: false };
  }

  static getDerivedStateFromProps(
    props: { readonly resetKey?: string },
    state: State,
  ): Partial<State> | null {
    const path = props.resetKey ?? '';
    if (state.failed && path !== state.path) {
      return { failed: false, path, eventId: null, copied: false };
    }
    if (path !== state.path) {
      return { path };
    }
    return null;
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportError(error, 'react').then(
      (eventId) => {
        if (eventId !== null && this.state.failed) this.setState({ eventId });
      },
      () => undefined,
    );
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    const messages = messagesFor(document.documentElement.lang || 'es');
    const code = this.state.eventId?.slice(0, 8) ?? null;
    return (
      <main className="screen-page screen-crash" role="alert">
        <h1>{messages.screenCrashTitle}</h1>
        <p>{messages.screenCrashReassure}</p>
        <p>
          <button
            type="button"
            className="ui-button is-primary is-md"
            onClick={() => {
              this.setState({ failed: false, eventId: null, copied: false });
            }}
          >
            {messages.screenCrashRetry}
          </button>{' '}
          <button
            type="button"
            className="ui-button is-md"
            onClick={() => {
              this.setState({ failed: false });
              window.location.assign('/today');
            }}
          >
            {messages.screenCrashBack}
          </button>
        </p>
        {code === null ? null : (
          <p>
            {messages.screenCrashCode} <code>{code}</code>{' '}
            <button
              type="button"
              className="ui-button is-ghost is-sm"
              onClick={() => {
                // Undefined outside secure contexts, whatever the DOM types say.
                const clipboard = navigator.clipboard as Clipboard | undefined;
                clipboard?.writeText(code).then(
                  () => {
                    this.setState({ copied: true });
                  },
                  () => undefined,
                );
              }}
            >
              {this.state.copied ? messages.screenCrashCopied : messages.screenCrashCopy}
            </button>
          </p>
        )}
      </main>
    );
  }
}
