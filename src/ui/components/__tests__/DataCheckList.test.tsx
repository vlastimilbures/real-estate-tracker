// @vitest-environment jsdom
//
// ADR 0118, ADR 0206 §6: Property detail's Data check rows. Each fix button is described
// by its own row, in both lists (#133: the ids once restarted in the second list).
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { edate } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { dashboardDataCheck } from "../../model/dataCheck";
import { DataCheckList } from "../DataCheckList";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("DataCheckList (ADR 0118)", () => {
  it("each fix button is described by its own row, in both lists (#133)", () => {
    const asOf = edate(BASE_DATE, 60);
    const check = dashboardDataCheck(
      portfolio,
      asOf,
      BASE_DATE,
      assumptions.horizonYears,
    );
    expect(check.attention.length).toBeGreaterThan(0);
    expect(check.defaults.length).toBeGreaterThan(0);
    render(
      <DataCheckList
        attention={check.attention}
        defaults={check.defaults}
        resetRate={assumptions.postFixationResetRatePa}
        onFix={() => {}}
      />,
    );
    const buttons = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-describedby"));
    expect(buttons).toHaveLength(
      check.attention.length + check.defaults.length,
    );
    const ids = buttons.map((b) => b.getAttribute("aria-describedby") ?? "");
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of buttons)
      expect(
        b
          .closest("li")
          ?.contains(
            document.getElementById(b.getAttribute("aria-describedby") ?? ""),
          ),
      ).toBe(true);
  });
});
