// @vitest-environment jsdom
//
// UX-072 (DR-150, ADR 0077): the property dialog marks its required fields through Field
// `required` (CSS marker + aria-required), like the record forms; no "*" in the strings.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PropertyFormModal } from "../PropertyFormModal";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { LANGUAGES } from "../../../i18n/types";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("property dialog required fields (UX-072)", () => {
  const f = getDict("en").propertyForm;

  it("marks name, purchase date and purchase price required", () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    for (const label of [f.name, f.purchaseDate, f.purchasePrice]) {
      const control = screen.getByLabelText(label);
      expect(control.getAttribute("aria-required"), label).toBe("true");
      const fieldLabel = control.closest(".field")?.querySelector("label");
      expect(fieldLabel?.className, label).toContain("required");
    }
  });

  it("leaves optional fields unmarked", () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    expect(
      screen.getByLabelText(f.address).getAttribute("aria-required"),
    ).toBeNull();
  });

  it.each(LANGUAGES.map((l) => l.value))(
    "has no '*' in the %s labels",
    (lang) => {
      const strings = Object.values(getDict(lang).propertyForm).filter(
        (v): v is string => typeof v === "string",
      );
      expect(strings.filter((s) => s.includes("*"))).toEqual([]);
    },
  );
});
