// @vitest-environment jsdom
//
// UX-049 (DR-119): stored data that breaks an engine rule makes the engine throw
// EngineInputError while rendering. The fallback must name the record and the rule in
// the user's language and offer to open the property — not show the raw code string.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "../ErrorBoundary";
import { useUiStore } from "../../../state/uiStore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { EngineInputError } from "../../../engine";
import { getDict } from "../../../i18n";
import {
  portfolio,
  assumptions,
  withPropertyId,
} from "../../../engine/__tests__/support/seed";

vi.mock("../../../data/errorLog", () => ({ logFailure: vi.fn() }));

const loan = portfolio.mortgages[0];
const owner = portfolio.properties.find((p) => p.id === loan.propertyId)!;

function Boom(): never {
  throw new EngineInputError([
    {
      code: "INSTALMENT_BELOW_INTEREST",
      entity: "mortgage",
      id: loan.id,
      field: "monthlyInstalment",
    },
  ]);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => {
    usePortfolioStore.setState({ portfolio, assumptions });
    useUiStore.setState({ language: "cs", route: "dashboard" });
  });
});

describe("ErrorBoundary with invalid stored data", () => {
  it("names the property and the rule, translated, without the raw code", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const cs = getDict("cs");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(cs.errorBoundary.invalidDataTitle);
    expect(alert.textContent).toContain(owner.name);
    expect(alert.textContent).toContain(
      cs.inputRules.INSTALMENT_BELOW_INTEREST,
    );
    expect(alert.textContent).not.toContain("INSTALMENT_BELOW_INTEREST");
  });

  it("opens the property from the fallback", async () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: getDict("cs").errorBoundary.openProperty,
      }),
    );
    expect(useUiStore.getState().route).toBe("property");
    expect(useUiStore.getState().selectedPropertyId).toBe(owner.id);
  });

  it('opens a property stored with the id "" (ADR 0127)', async () => {
    act(() =>
      usePortfolioStore.setState({
        portfolio: withPropertyId(loan.propertyId, ""),
      }),
    );
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: getDict("cs").errorBoundary.openProperty,
      }),
    );
    expect(useUiStore.getState().route).toBe("property");
    expect(useUiStore.getState().selectedPropertyId).toBe("");
  });

  it("keeps the generic fallback for other crashes", () => {
    function Other(): never {
      throw new Error("plain bug");
    }
    render(
      <ErrorBoundary>
        <Other />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      getDict("cs").errorBoundary.title,
    );
  });
});

describe("ErrorBoundary resetKey (ADR 0146)", () => {
  it("VG2504A: a new key clears the error (#131)", () => {
    function Other(): never {
      throw new Error("plain bug");
    }
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Other />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(
      <ErrorBoundary resetKey="b">
        <p>recovered</p>
      </ErrorBoundary>,
    );
    expect(screen.queryByText("recovered")).not.toBeNull();
  });
});
