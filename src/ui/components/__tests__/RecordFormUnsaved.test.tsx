// @vitest-environment jsdom
//
// ADR 0095: a record form says "Unsaved changes" next to its buttons while it holds
// unsaved edits, and nothing while it is clean.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../forms";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { FieldSpec } from "../../model/formParse";

const en = getDict("en");
const specs: FieldSpec[] = [
  { name: "monthlyRent", label: "Monthly rent", kind: "money" },
];

beforeEach(() =>
  act(() =>
    useUiStore.setState({
      language: "en",
      unsavedSources: [],
      unsavedChanges: false,
    }),
  ),
);

describe("RecordForm unsaved state (ADR 0095)", () => {
  it("shows Unsaved changes in the footer only while edited", async () => {
    const { container } = render(
      <RecordForm
        specs={specs}
        initial={{ monthlyRent: "100" }}
        submitLabel="Save"
        onSubmit={async () => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.queryByText(en.common.unsavedChanges)).toBeNull();
    const field = screen.getByLabelText(/^Monthly rent/);
    await userEvent.type(field, "5");
    const note = screen.getByText(en.common.unsavedChanges);
    expect(note.closest(".form-actions")).toBe(
      container.querySelector(".form-actions"),
    );
    await userEvent.clear(field);
    await userEvent.type(field, "100");
    expect(screen.queryByText(en.common.unsavedChanges)).toBeNull();
  });
});
