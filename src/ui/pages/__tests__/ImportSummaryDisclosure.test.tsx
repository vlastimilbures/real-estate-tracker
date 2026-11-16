// @vitest-environment jsdom
//
// ADR 0203 §3 (#381), ADR 0160: the Import lists keep their default open state. An add
// list opens when one of its adds has notes; the update list opens in the preview and is
// shut in the report.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportSummary } from "../ImportPanels";
import type { ImportItem } from "../../../state/csv";
import { en } from "../../../i18n/en";

const p = en.importPage;

const add: ImportItem = {
  file: "mortgages",
  row: 2,
  kind: "add",
  propertyId: "byt-javorova",
  propertyName: "Byt Javorova",
  date: "2031-01-17",
  changes: [],
};
const addWithNotes: ImportItem = {
  ...add,
  replaces: [{ kind: "recast", date: "2033-01-17" }],
};
const update: ImportItem = {
  ...add,
  row: 3,
  kind: "update",
  date: "2021-01-17",
  changes: [{ field: "interest_rate_pa", before: "0.0169", after: "0.0179" }],
};

const expanded = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-expanded");

describe("ImportSummary default open state (ADR 0203 §3, ADR 0160)", () => {
  it("opens an add list when an add has notes, in the preview and the report", () => {
    const { unmount } = render(
      <ImportSummary items={[addWithNotes]} mode="preview" />,
    );
    expect(expanded(p.willAdd(1))).toBe("true");
    unmount();
    render(<ImportSummary items={[addWithNotes]} mode="report" />);
    expect(expanded(p.added(1))).toBe("true");
  });

  it("keeps an add list without notes shut", () => {
    render(<ImportSummary items={[add]} mode="preview" />);
    expect(expanded(p.willAdd(1))).toBe("false");
  });

  it("opens the update list in the preview and keeps it shut in the report", () => {
    const { unmount } = render(
      <ImportSummary items={[update]} mode="preview" />,
    );
    expect(expanded(p.willUpdate(1))).toBe("true");
    unmount();
    render(<ImportSummary items={[update]} mode="report" />);
    expect(expanded(p.updated(1))).toBe("false");
  });

  it("takes the new default when a new preview gives an add notes", () => {
    const { rerender } = render(<ImportSummary items={[add]} mode="preview" />);
    expect(expanded(p.willAdd(1))).toBe("false");
    rerender(<ImportSummary items={[addWithNotes]} mode="preview" />);
    expect(expanded(p.willAdd(1))).toBe("true");
  });
});
