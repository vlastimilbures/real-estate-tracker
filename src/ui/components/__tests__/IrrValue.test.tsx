// @vitest-environment jsdom
//
// UX-079 (DR-158, ADR 0079): a levered IRR with no value shows "n/a" and its reason
// (as a tooltip and to screen readers) instead of a blank dash.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { D } from "../../../lib/money";
import { en } from "../../../i18n/en";
import { IrrValue } from "../primitives";

describe("IrrValue (UX-079)", () => {
  it("shows the rate as a percentage", () => {
    const { container } = render(
      <IrrValue irr={{ rate: D("0.0615"), reason: null }} />,
    );
    expect(container.textContent).toBe("6,2 %");
  });

  it("shows n/a with the reason as tooltip and screen-reader text", () => {
    const { container } = render(
      <IrrValue irr={{ rate: null, reason: "NOT_UNIQUE" }} />,
    );
    const el = container.querySelector(".num")!;
    expect(el.getAttribute("title")).toBe(en.common.irrNotUnique);
    expect(el.textContent).toBe(
      `${en.common.notApplicable} (${en.common.irrNotUnique})`,
    );
    expect(container.querySelector(".sr-only")?.textContent).toBe(
      ` (${en.common.irrNotUnique})`,
    );
  });
});
