// "Skip to content": the first tab stop, shown only while focused (ADR 0114). It moves
// focus to <main id="main" tabIndex={-1}>. A button, not a link: WebKit's Tab skips links
// unless "Press Tab to highlight each item" is on, and the app runs in WKWebView.
import { useT } from "../hooks/useT";

export function SkipLink() {
  const t = useT();
  return (
    <button
      type="button"
      className="skip-link"
      onClick={() => document.getElementById("main")?.focus()}
    >
      {t.shell.skipToContent}
    </button>
  );
}
