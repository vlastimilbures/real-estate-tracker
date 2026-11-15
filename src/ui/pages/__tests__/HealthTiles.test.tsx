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

/** The label row holds the label alone; the foot starts with the marker and word. */
function expectFootMarker(tile: HTMLElement, band: string, word: string) {
  const label = tile.querySelector(".label")!;
  expect(label.nextElementSibling?.classList.contains("value")).toBe(true);
  expect(tile.querySelector(".badge")).toBeNull();
  const foot = tile.querySelector(".foot")!;
  const marker = foot.firstElementChild!;
  expect(marker.classList.contains("health-marker")).toBe(true);
  expect(marker.classList.contains(band)).toBe(true);
  expect(marker.querySelector(".health-word")?.textContent).toBe(word);
  expect(foot.textContent!.startsWith(`${word} · `)).toBe(true);
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

  it("Debt (LTV) and DSCR tiles carry the marker in the foot", () => {
    render(<PropertySnapshotTiles s={s} chartRows={[]} modeWord="nominal" />);
    const debt = screen
      .getAllByText(en.propertyDetail.debt)
      .map((e) => e.closest(".tile"))
      .find((e) => e?.textContent?.includes(en.propertyDetail.ltv));
    if (!(debt instanceof HTMLElement)) throw new Error("no Debt tile");
    expectFootMarker(debt, ltvBand(s.ltv), ltvBandWord(en, s.ltv)!);
    const dscr = tileOf(screen.getByText(en.propertyDetail.dscr));
    expectFootMarker(dscr, dscrBand(s.dscr), dscrBandWord(en, s.dscr)!);
  });
});
