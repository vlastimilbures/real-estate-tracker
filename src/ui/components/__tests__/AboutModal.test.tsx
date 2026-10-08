// @vitest-environment jsdom
//
// UX-064 (D-64): the offline app opens nothing outside itself, so About shows the source
// address and the feedback (issues) address as plain, selectable text — no links.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutModal } from "../AboutModal";
import { Modal } from "../Modal";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";

beforeEach(() => {
  act(() => useUiStore.setState({ language: "en" }));
});

describe("About (UX-064)", () => {
  it("has no links", () => {
    const { container } = render(<AboutModal onClose={() => {}} />);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("shows the feedback and source addresses as text", () => {
    const { container } = render(<AboutModal onClose={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain(en.about.feedbackText);
    expect(text).toContain(en.about.sourceText);
  });

  // ADR 0092: the limitations and data-safety documents, as plain text like Source.
  it("shows the limitations and data-safety document addresses as text", () => {
    const { container } = render(<AboutModal onClose={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain(en.about.limitsLabel);
    expect(text).toContain(
      "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/model-limitations.md",
    );
    expect(text).toContain(en.about.dataSafetyLabel);
    expect(text).toContain(
      "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/data-safety.md",
    );
  });

  // ADR 0105 (#22): the language changes interface text only, never currency or formats.
  it("says the language does not change amounts or formats", () => {
    const { container } = render(<AboutModal onClose={() => {}} />);
    expect(container.textContent ?? "").toContain(en.about.formatsNote);
  });

  // ADR 0082: feedback goes to GitHub issues; no personal e-mail address is shown.
  it("shows no e-mail address", () => {
    const { container } = render(<AboutModal onClose={() => {}} />);
    expect(container.textContent ?? "").not.toMatch(/@/);
  });
});

// UX-071 (DR-178, ADR 0077): the body scrolls, so it must be reachable by keyboard.
describe("About body (UX-071)", () => {
  it("is a focusable region named by the dialog title", () => {
    const { getByRole } = render(<AboutModal onClose={() => {}} />);
    const body = getByRole("region", { name: en.about.title });
    expect(body).toHaveProperty("tabIndex", 0);
    expect(body.classList.contains("modal-body")).toBe(true);
  });

  it("keeps first focus on the close button, the body next in Tab order", () => {
    const { getByRole } = render(<AboutModal onClose={() => {}} />);
    const close = getByRole("button", { name: en.common.close });
    expect(document.activeElement).toBe(close);
    const body = getByRole("region", { name: en.about.title });
    expect(
      close.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// #128 R5-14 (ADR 0157): About shares the Modal chrome and, opened over another dialog,
// one Escape closes About only.
describe("About over another dialog (#128 R5-14)", () => {
  it("closes About alone on one Escape, then the dialog below", async () => {
    const user = userEvent.setup();
    const onForm = vi.fn();
    const onAbout = vi.fn();
    const { rerender } = render(
      <>
        <Modal titleId="form" title="Edit" onClose={onForm} closeLabel="Close">
          <input aria-label="Name" />
        </Modal>
        <AboutModal onClose={onAbout} />
      </>,
    );
    await user.keyboard("{Escape}");
    expect(onAbout).toHaveBeenCalledOnce();
    expect(onForm).not.toHaveBeenCalled();
    rerender(
      <Modal titleId="form" title="Edit" onClose={onForm} closeLabel="Close">
        <input aria-label="Name" />
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onForm).toHaveBeenCalledOnce();
  });
});
