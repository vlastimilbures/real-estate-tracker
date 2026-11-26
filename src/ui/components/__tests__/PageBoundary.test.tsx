// @vitest-environment jsdom
//
// #442: a crash screen that is on screen when the language changes shows the new
// language: the invalid-data notice and the generic fallback, from the page boundary
// and from the boundary inside the app shell.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PageBoundary } from "../PageBoundary";
import { AppLayout } from "../AppLayout";
import { PageFrame } from "../PageFrame";
import { useUiStore } from "../../../state/uiStore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { EngineInputError } from "../../../engine";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

const loan = portfolio.mortgages[0];

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

function Other(): never {
  throw new Error("plain bug");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => {
    usePortfolioStore.setState({ portfolio, assumptions });
    useUiStore.setState({ language: "cs" });
  });
});

/** Switch the language with the crash screen shown; return the alert's text. */
function switchToEnglish(): string {
  act(() => useUiStore.setState({ language: "en" }));
  return screen.getByRole("alert").textContent ?? "";
}

describe("error screens follow a language switch (#442)", () => {
  it("page boundary: the invalid-data notice", () => {
    render(
      <PageBoundary>
        <Boom />
      </PageBoundary>,
    );
    const text = switchToEnglish();
    expect(text).toContain(getDict("en").errorBoundary.invalidDataTitle);
    expect(text).not.toContain(getDict("cs").errorBoundary.invalidDataTitle);
  });

  it("page boundary: the generic fallback", () => {
    render(
      <PageBoundary>
        <Other />
      </PageBoundary>,
    );
    const text = switchToEnglish();
    expect(text).toContain(getDict("en").errorBoundary.title);
    expect(text).not.toContain(getDict("cs").errorBoundary.title);
  });

  it("app shell boundary: the invalid-data notice", () => {
    render(
      <AppLayout>
        <PageFrame title="Dashboard">
          <Boom />
        </PageFrame>
      </AppLayout>,
    );
    const text = switchToEnglish();
    expect(text).toContain(getDict("en").errorBoundary.invalidDataTitle);
    expect(text).not.toContain(getDict("cs").errorBoundary.invalidDataTitle);
  });

  it("app shell boundary: the generic fallback", () => {
    render(
      <AppLayout>
        <PageFrame title="Dashboard">
          <Other />
        </PageFrame>
      </AppLayout>,
    );
    const text = switchToEnglish();
    expect(text).toContain(getDict("en").errorBoundary.title);
    expect(text).not.toContain(getDict("cs").errorBoundary.title);
  });
});
