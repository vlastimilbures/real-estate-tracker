import { BrandMark } from "./BrandMark";
import { Modal } from "./Modal";
import { useT } from "../hooks/useT";
import "../styles/about.css";

// Static, dependency-free About dialog. Pure presentation — no engine imports and no store
// reads beyond the active language. Introduces the app, credits the developer, and surfaces
// the build-time version. Addresses are plain, selectable text (UX-064): the app opens
// nothing outside itself. Opened from the native macOS menu (App → About…), bridged via the
// `menu://about` event in App.tsx. The shared Modal chrome: dismiss with X, Escape, or a
// backdrop click.

export function AboutModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const a = t.about;
  return (
    <Modal
      titleId="about-modal-title"
      title={a.title}
      onClose={onClose}
      closeLabel={t.common.close}
      scrollRegion
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
        <p className="about-prose">{a.formatsNote}</p>
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
    </Modal>
  );
}
