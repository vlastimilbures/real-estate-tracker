import { X } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { useModalA11y } from "../hooks/useModalA11y";
import { useT } from "../hooks/useT";
import "../styles/about.css";

// Static, dependency-free About dialog. Pure presentation — no engine imports and no store
// reads beyond the active language. Introduces the app, credits the developer, and surfaces
// the build-time version. Addresses are plain, selectable text (UX-064): the app opens
// nothing outside itself. Opened from the native macOS menu (App → About…), bridged via the
// `menu://about` event in App.tsx. Dismiss with X, Escape (useModalA11y), or backdrop click.

export function AboutModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const a = t.about;
  const dialogRef = useModalA11y(onClose, {
    trap: true,
    restoreFocus: true,
  });

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        tabIndex={-1}
      >
        <div className="modal-head">
          <h3 id="about-modal-title">{a.title}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t.common.close}
          >
            <X size={18} />
          </button>
        </div>

        {/* The body scrolls: a named, focusable region lets the keyboard scroll it (UX-071). */}
        <div
          className="modal-body"
          role="region"
          aria-labelledby="about-modal-title"
          tabIndex={0}
        >
          <div className="about-hero">
            <BrandMark size={56} className="about-logo" />
            <div className="about-hero-text">
              <h2 className="about-name">{a.subtitle}</h2>
              <div className="about-version">{a.version(__APP_VERSION__)}</div>
              <p className="about-tagline">{a.tagline}</p>
            </div>
          </div>

          <section className="about-section">
            <h4>{a.appTitle}</h4>
            <p className="about-prose">{a.appBody}</p>
          </section>

          <section className="about-section">
            <h4>{a.privacyTitle}</h4>
            <p className="about-prose">{a.privacyBody}</p>
          </section>

          <section className="about-section">
            <h4>{a.developerTitle}</h4>
            <div className="about-dev">
              <span className="about-dev-name">{a.developerName}</span>
              <dl className="about-meta">
                <dt>{a.feedbackLabel}</dt>
                <dd>{a.feedbackText}</dd>
                <dt>{a.sourceLabel}</dt>
                <dd>{a.sourceText}</dd>
                <dt>{a.limitsLabel}</dt>
                <dd>{a.limitsText}</dd>
                <dt>{a.dataSafetyLabel}</dt>
                <dd>{a.dataSafetyText}</dd>
              </dl>
            </div>
          </section>

          <section className="about-section">
            <h4>{a.builtWithTitle}</h4>
            <p className="about-stack">{a.builtWithBody}</p>
            <p className="about-prose">{a.precisionNote}</p>
          </section>

          <div className="about-foot">
            <span>{a.copyright}</span>
            <span className="about-foot-sep">·</span>
            <span>{a.usageNote}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
