// Backstop for render-time exceptions: a throw inside a page subtree shows a fallback
// here instead of blanking the whole window. Expected/handled failures (DB writes)
// surface via the store's `error`; this catches the *unexpected* crashes React can't
// recover from on its own. Must be a class component — error boundaries have no hook
// equivalent.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./primitives";
import { useUiStore } from "../../state/uiStore";
import { getDict } from "../../i18n";
import { logFailure } from "../../state/diagnostics";
import { usePortfolioStore } from "../../state/portfolioStore";
import { EngineInputError } from "../../engine";
import { InvalidDataNotice } from "./InvalidDataNotice";

interface Props {
  children: ReactNode;
  /** Optional custom fallback; receives the error and a reset to retry the subtree. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** When this changes while an error is shown, the subtree renders again, e.g. the
   *  route: navigating away clears a crash notice (ADR 0146). */
  resetKey?: unknown;
}
interface State {
  error: Error | null;
  /** The resetKey the current error belongs to. */
  resetKey: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  // A new key clears the error before rendering, so the children render once with the
  // new key: an error they throw then is caught and logged once, and the old fallback
  // never renders with the new key (ADR 0146).
  static getDerivedStateFromProps(
    props: Props,
    state: State,
  ): Partial<State> | null {
    return props.resetKey === state.resetKey
      ? null
      : { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      "ErrorBoundary caught a render error:",
      error,
      info.componentStack,
    );
    logFailure("RENDER", error);
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return <BoundaryFallback error={error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

/** The default fallback: the invalid-data notice for an engine input error, else a
 *  generic message with "Try again". Exported so a custom fallback can wrap it. */
export function BoundaryFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}): ReactNode {
  // Non-reactive read: the fallback doesn't use the useT hook, and the language won't
  // change while a crash is on screen. The active language's dictionary is loaded
  // before the first render (DR-009).
  const t = getDict(useUiStore.getState().language);
  if (error instanceof EngineInputError) {
    // Stored data breaks an engine rule (UX-049): say which record and which rule, and
    // offer the property where it can be corrected.
    return (
      <InvalidDataNotice
        t={t}
        error={error}
        portfolio={usePortfolioStore.getState().portfolio}
        onOpenProperty={(id) => {
          useUiStore.getState().openProperty(id);
          reset();
        }}
      />
    );
  }
  return (
    <div className="error-boundary" role="alert">
      <h3>{t.errorBoundary.title}</h3>
      <code>{error.message}</code>
      <Button type="button" onClick={reset}>
        {t.errorBoundary.tryAgain}
      </Button>
    </div>
  );
}
