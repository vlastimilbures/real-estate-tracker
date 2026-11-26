// @vitest-environment jsdom
//
// ADR 0258: Property detail with a leftover mortgage block. The invalid-data notice names
// both start dates and offers "Go to Financing", which puts focus on the Financing
// section's heading (ADR 0248, ADR 0107). "Open property" from the Dashboard lands there.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { isoDate } from "../../../engine";
import { sectionId } from "../../model/sectionNav";

const dubova = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;
const leftover = {
  ...portfolio,
  mortgages: [
    ...portfolio.mortgages,
    { ...dubova, id: "m-left", startDate: isoDate("2024-03-01") },
  ],
};
const hint = en.errorBoundary.leftoverBlock(
  "Byt Dubova",
  "01.03.2024",
  "12.03.2024",
);
const goToFinancing = en.dataCheck.goTo(en.propertyDetail.sectionFinancing);

/** The heading focusSection lands on: the first one in the Financing section. */
const financingHeading = () =>
  document
    .getElementById(sectionId("financing"))!
    .querySelector<HTMLElement>("h2, h3")!;

beforeEach(() =>
  act(() => {
    usePortfolioStore.setState({
      portfolio: leftover,
      assumptions,
      status: { kind: "ready" },
    });
    useUiStore.setState({
      route: "property",
      selectedPropertyId: "dubova",
    });
  }),
);

describe("Property detail with a leftover mortgage block (ADR 0258)", () => {
  it("names both start dates in the notice", () => {
    render(<PropertyDetail />);
    expect(screen.getByRole("alert").textContent).toContain(hint);
  });

  it("Go to Financing focuses the Financing section heading", async () => {
    render(<PropertyDetail />);
    await userEvent.click(screen.getByRole("button", { name: goToFinancing }));
    const heading = financingHeading();
    expect(heading.textContent).toBe(en.propertyDetail.mortgagesTitle);
    expect(document.activeElement).toBe(heading);
  });

  it("Open property's Financing target lands on the same heading", () => {
    act(() => useUiStore.getState().openProperty("dubova", "financing"));
    render(<PropertyDetail />);
    expect(document.activeElement).toBe(financingHeading());
  });
});
