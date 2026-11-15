// @vitest-environment jsdom
//
// ADR 0214 (#391): the Valuations and Leases explanations leave the panel header for the
// body: Leases as a help line, Valuations behind "About this".
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { ValuationsPanel, LeasesPanel } from "../PropertyEntityPanels";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";

const d = en.propertyDetail;
beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

const panelOf = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("section")!;

describe("records panels' explanations (ADR 0214 §4)", () => {
  it("Leases: a help line atop the body; the header is the title alone", () => {
    render(<LeasesPanel propertyId="p1" rows={[]} />);
    const panel = panelOf(d.leasesTitle);
    expect(panel.querySelector(".panel-head .hint")).toBeNull();
    const help = panel.querySelector(".panel-body > .panel-help");
    expect(help?.textContent).toBe(d.leasesHint);
    expect(help?.querySelector("[hidden]")).toBeNull();
  });

  it("Valuations: the explanation is one click away", () => {
    render(<ValuationsPanel propertyId="p1" rows={[]} />);
    const panel = panelOf(d.valuationsTitle);
    expect(panel.querySelector(".panel-head .hint")).toBeNull();
    expect(
      within(panel).getByRole("button", {
        name: `${en.common.aboutThis}: ${d.valuationsTitle}`,
      }),
    ).toBeTruthy();
    expect(
      within(panel).getByText(d.valuationsHint).closest("[hidden]"),
    ).not.toBeNull();
  });
});
