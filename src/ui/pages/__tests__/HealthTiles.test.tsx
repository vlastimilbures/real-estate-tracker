// @vitest-environment jsdom
//
// ADR 0195 §3 (#373): a tile's band shows as a marker and its word at the start of the
// foot; the label row holds only the label, so it stays on one line.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { portfolioSnapshot, propertySnapshot } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import {
  dscrBand,
  dscrBandWord,
  ltvBand,
  ltvBandWord,
} from "../../model/health";
import { renderStrip } from "./kpiStripSupport";
import { PropertySnapshotTiles } from "../PropertyDetailPanels";

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

function tileOf(el: HTMLElement): HTMLElement {
  return el.closest(".tile") as HTMLElement;
}

/** The KPI strip's foot holds the marker and the word only (ADR 0200 §1). */
function expectFootMarkerOnly(tile: HTMLElement, band: string, word: string) {
  const label = tile.querySelector(".label")!;
  expect(label.nextElementSibling?.classList.contains("value")).toBe(true);
  const foot = tile.querySelector(".foot")!;
  const marker = foot.firstElementChild!;
  expect(marker.classList.contains("health-marker")).toBe(true);
  expect(marker.classList.contains(band)).toBe(true);
  expect(foot.textContent).toBe(word);
}

describe("Dashboard KPI strip risk tiles (ADR 0195, 0200)", () => {
  const s = portfolioSnapshot(portfolio, assumptions);

  it("LTV: the foot is the marker and word", () => {
    renderStrip(s);
    const tile = tileOf(screen.getByText(en.dashboard.portfolioLtv));
    expectFootMarkerOnly(tile, ltvBand(s.ltv), ltvBandWord(en, s.ltv)!);
  });

  it("DSCR: the foot is the marker and word", () => {
    renderStrip(s);
    const tile = tileOf(screen.getByText(en.dashboard.portfolioDscr));
    expectFootMarkerOnly(tile, dscrBand(s.dscr), dscrBandWord(en, s.dscr)!);
  });
});

describe("Property detail tiles (ADR 0195)", () => {
  const p = portfolio.properties[0]!;
  const s = propertySnapshot(p, portfolio, assumptions);

  it("LTV and DSCR tiles carry the marker and word as their foot (ADR 0215)", () => {
    render(
      <PropertySnapshotTiles
        s={s}
        chartRows={[]}
        modeWord="nominal"
        basis={{ kind: "today" }}
      />,
    );
    const ltv = tileOf(screen.getByText(en.propertyDetail.ltv));
    expectFootMarkerOnly(ltv, ltvBand(s.ltv), ltvBandWord(en, s.ltv)!);
    const dscr = tileOf(screen.getByText(en.propertyDetail.dscr));
    expectFootMarkerOnly(dscr, dscrBand(s.dscr), dscrBandWord(en, s.dscr)!);
  });
});
