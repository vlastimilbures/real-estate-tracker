// ADR 0155 (#127): one definition of "nothing to show" for the portfolio pages.
import { describe, it, expect } from "vitest";
import { portfolioState } from "../portfolioState";
import type { Portfolio } from "../../../engine";
import { mixed } from "../../../engine/__tests__/support/mixed";

const withActive = (
  active: (id: string) => boolean | undefined,
): Portfolio => ({
  ...mixed,
  properties: mixed.properties.map((p) => ({ ...p, active: active(p.id) })),
});

describe("portfolioState", () => {
  it("is empty with no property", () => {
    expect(portfolioState({ ...mixed, properties: [] })).toEqual({
      kind: "empty",
    });
  });

  it("counts the properties when every one is deactivated", () => {
    expect(portfolioState(withActive(() => false))).toEqual({
      kind: "allInactive",
      count: mixed.properties.length,
    });
  });

  it("is ready with one active property, a missing flag counting as active", () => {
    expect(portfolioState(mixed).kind).toBe("ready");
    expect(
      portfolioState(withActive((id) => (id === "dev" ? undefined : false)))
        .kind,
    ).toBe("ready");
  });

  it("counts a pending purchase as active", () => {
    expect(portfolioState(withActive((id) => id === "future")).kind).toBe(
      "ready",
    );
  });
});
