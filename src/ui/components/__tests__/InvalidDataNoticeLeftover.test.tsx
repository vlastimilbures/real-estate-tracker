// @vitest-environment jsdom
//
// ADR 0258: on the app-wide fallback, a leftover mortgage block gets a hint line after
// the rule, and "Open property" opens the property at its Financing section.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "../ErrorBoundary";
import { InvalidDataNotice } from "../InvalidDataNotice";
import { useUiStore } from "../../../state/uiStore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { EngineInputError, isoDate, validatePortfolio } from "../../../engine";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

const en = getDict("en");
const dubova = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;
// Byt Dubova from 12.03.2024, plus a row imported from 01.03.2024 (before ADR 0226).
const leftover = {
  ...portfolio,
  mortgages: [
    ...portfolio.mortgages,
    { ...dubova, id: "m-left", startDate: isoDate("2024-03-01") },
  ],
};
const leftoverError = new EngineInputError(validatePortfolio(leftover));
const hint = en.errorBoundary.leftoverBlock(
  "Byt Dubova",
  "01.03.2024",
  "12.03.2024",
);
const goToFinancing = en.dataCheck.goTo(en.propertyDetail.sectionFinancing);

function Boom({ error }: { error: EngineInputError }): never {
  throw error;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => {
    usePortfolioStore.setState({ portfolio: leftover, assumptions });
    useUiStore.setState({
      language: "en",
    });
  });
});

describe("the invalid-data notice for a leftover block (ADR 0258)", () => {
  it("adds the hint after the rule line", () => {
    render(
      <ErrorBoundary>
        <Boom error={leftoverError} />
      </ErrorBoundary>,
    );
    const items = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(items).toEqual([
      `Byt Dubova: ${en.inputRules.REFINANCE_WITHIN_A_MONTH}`,
      hint,
    ]);
    expect(screen.getByRole("alert").textContent).toContain(hint);
  });

  it("opens the property at its Financing section", async () => {
    render(
      <ErrorBoundary>
        <Boom error={leftoverError} />
      </ErrorBoundary>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.errorBoundary.openProperty }),
    );
    const ui = useUiStore.getState();
    expect(ui.route).toBe("property");
    expect(ui.selectedPropertyId).toBe("dubova");
    expect(ui.request).toMatchObject({ target: "financing" });
  });

  it("opens the property as before for another rule", async () => {
    const other = new EngineInputError([
      { code: "INSTALMENT_BELOW_INTEREST", entity: "mortgage", id: dubova.id },
    ]);
    act(() => usePortfolioStore.setState({ portfolio }));
    render(
      <ErrorBoundary>
        <Boom error={other} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).not.toContain(hint);
    await userEvent.click(
      screen.getByRole("button", { name: en.errorBoundary.openProperty }),
    );
    expect(useUiStore.getState().selectedPropertyId).toBe("dubova");
    expect(useUiStore.getState().request).toBeNull();
  });

  it("offers Go to Financing only without Open property and with a hint", () => {
    const { unmount } = render(
      <InvalidDataNotice
        error={leftoverError}
        portfolio={leftover}
        onOpenProperty={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: goToFinancing })).toBeNull();
    unmount();
    render(
      <InvalidDataNotice
        error={
          new EngineInputError([
            {
              code: "INSTALMENT_BELOW_INTEREST",
              entity: "mortgage",
              id: dubova.id,
            },
          ])
        }
        portfolio={portfolio}
      />,
    );
    expect(screen.queryByRole("button", { name: goToFinancing })).toBeNull();
  });
});
