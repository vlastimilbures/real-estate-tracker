// @vitest-environment jsdom
//
// ADR 0214 (#391): the Valuations and Leases explanations leave the panel header for the
// body. ADR 0217 (#416): both are definitions, so both sit behind the info icon.
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
  it("Leases: behind the info icon in the head; the body starts with the table", () => {
    render(<LeasesPanel propertyId="p1" rows={[]} />);
    const panel = panelOf(d.leasesTitle);
    expect(panel.querySelector(".panel-head .hint")).toBeNull();
    expect(panel.querySelector(".panel-help")).toBeNull();
    const button = within(panel).getByRole("button", {
      name: `${en.common.aboutThis}: ${d.leasesTitle}`,
    });
    expect(panel.querySelector(".panel-head")!.contains(button)).toBe(true);
    expect(
      within(panel).getByText(d.leasesHint).closest("[hidden]"),
    ).not.toBeNull();
  });

  it("Valuations: the explanation is behind the info icon", () => {
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
