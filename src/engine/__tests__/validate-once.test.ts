// DR-128: a public entry point validates the portfolio once, not again in every nested
// public call (portfolioKpis → portfolioProjection → propertyProjection per property;
// portfolioSnapshot → propertySnapshot per property), nor in the one-pass entry points the
// app runs (portfolioOutputs, projectionAndKpis; DR-042). The block-level loan asserts are
// separate (they raise loan codes assertInputs does not cover) and are not counted here.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertInputs } from "../validate";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { portfolioProjection, propertyProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { portfolioOutputs, projectionAndKpis } from "../outputs";
import { schedulesByProperty } from "../schedule";
import { assumptions, portfolio } from "./support/seed";

vi.mock("../validate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../validate")>();
  return { ...actual, assertInputs: vi.fn(actual.assertInputs) };
});

const calls = () => vi.mocked(assertInputs).mock.calls.length;

describe("DR-128 — assertInputs runs once per public call", () => {
  beforeEach(() => {
    vi.mocked(assertInputs).mockClear();
  });

  it("portfolioKpis", () => {
    portfolioKpis(portfolio, assumptions);
    expect(calls()).toBe(1);
  });

  it("portfolioProjection", () => {
    portfolioProjection(portfolio, assumptions);
    expect(calls()).toBe(1);
  });

  it("portfolioSnapshot", () => {
    portfolioSnapshot(portfolio, assumptions);
    expect(calls()).toBe(1);
  });

  it("portfolioOutputs", () => {
    portfolioOutputs(portfolio, assumptions);
    expect(calls()).toBe(1);
  });

  it("projectionAndKpis", () => {
    projectionAndKpis(portfolio, assumptions);
    expect(calls()).toBe(1);
  });

  it("propertyProjection and propertySnapshot still validate on their own", () => {
    const first = portfolio.properties[0];
    const schedule =
      schedulesByProperty(portfolio.mortgages, [first.id], assumptions).get(
        first.id,
      ) ?? [];
    propertyProjection(first, portfolio, assumptions, schedule);
    propertySnapshot(first, portfolio, assumptions);
    expect(calls()).toBe(2);
  });
});
