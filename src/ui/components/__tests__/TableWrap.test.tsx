// @vitest-environment jsdom
//
// UX-024: a scrolling table is a named, keyboard-focusable region.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableWrap } from "../layout";
import { ProjectionGrid } from "../ProjectionGrid";
import { getDict } from "../../../i18n";

describe("TableWrap (UX-024)", () => {
  it("is a focusable region named by its label", () => {
    render(
      <TableWrap label="Amortization">
        <table />
      </TableWrap>,
    );
    const region = screen.getByRole("region", { name: "Amortization" });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain("table-wrap");
  });

  it("the projection grid scrolls in a named region", () => {
    render(
      <ProjectionGrid rows={[]} baseDate={new Date(Date.UTC(2026, 5, 7))} />,
    );
    const region = screen.getByRole("region", {
      name: getDict("en").projGrid.caption,
    });
    expect(region.tabIndex).toBe(0);
  });
});
