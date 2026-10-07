// @vitest-environment jsdom
//
// UX-040: required fields are marked "*" in every form, and an invalid value says the
// expected format instead of a bare "Invalid value".
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../forms";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { invalidHint } from "../../model/formParse";
import type { FieldSpec } from "../../model/formParse";

const specs: FieldSpec[] = [
  { name: "startDate", label: "Start date", kind: "date" },
  { name: "amount", label: "Amount", kind: "money" },
  { name: "note", label: "Rate", kind: "pct", optional: true },
];

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("required marks (UX-040)", () => {
  it("marks required fields with * and aria-required; optional ones without", () => {
    render(
      <RecordForm
        specs={specs}
        initial={{}}
        submitLabel="Save"
        onSubmit={() => {}}
      />,
    );
    const start = screen.getByLabelText(/Start date/);
    const rate = screen.getByLabelText(/Rate/);
    expect(start.getAttribute("aria-required")).toBe("true");
    expect(rate.getAttribute("aria-required")).toBeNull();
    const required = [...document.querySelectorAll("label.required")].map(
      (l) => l.textContent,
    );
    expect(required).toEqual(["Start date", "Amount"]);
  });
});

describe("format hints (UX-040)", () => {
  it("invalidHint names the expected format per kind", () => {
    expect(invalidHint(en, "date")).toBe(
      "Enter a date from 01.01.1900 as dd.mm.yyyy",
    );
    expect(invalidHint(en, "money")).toMatch(/1 250 000/);
    expect(invalidHint(en, "pct")).toMatch(/4,5/);
    expect(invalidHint(en, "int")).toMatch(/whole number/);
    expect(invalidHint(cs, "date")).toMatch(/dd\.mm\.yyyy/);
  });

  it("an unparsable field shows the hint for its kind", async () => {
    render(
      <RecordForm
        specs={specs}
        initial={{ startDate: "31.02.2026", amount: "abc" }}
        submitLabel="Save"
        onSubmit={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(invalidHint(en, "date"))).toBeTruthy();
    expect(screen.getByText(invalidHint(en, "money"))).toBeTruthy();
  });
});
