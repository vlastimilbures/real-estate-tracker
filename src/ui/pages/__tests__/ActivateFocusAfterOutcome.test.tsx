// @vitest-environment jsdom
//
// ADR 0248 §2–§3 (#549): Activate on Property detail disables itself while it runs, which
// drops focus to <body>. After a failure focus goes back to Activate; after a success to
// the same button, now Deactivate. Focus the user moved stays where it is.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import type { MutationResult } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { deferred, type Deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const p = portfolio.properties[0]!;
const inactive = {
  ...portfolio,
  properties: portfolio.properties.map((x) =>
    x.id === p.id ? { ...x, active: false } : x,
  ),
};
const failure: MutationResult = {
  ok: false,
  error: { kind: "other", message: "Disk full" },
};

let write: Deferred<MutationResult>;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  write = deferred();
  act(() => {
    usePortfolioStore.setState({
      portfolio: inactive,
      assumptions,
      status: { kind: "ready" },
      setPropertyActive: () => write.promise,
    });
    useUiStore.setState({ route: "property", selectedPropertyId: p.id });
  });
});
afterEach(() => vi.unstubAllGlobals());

const bar = () => within(screen.getByRole("banner"));
const activate = () =>
  bar().getByRole("button", {
    name: new RegExp(
      `^(${en.propertyDetail.activate}|${en.propertyDetail.activating})$`,
    ),
  });

async function startActivate() {
  render(
    <>
      <PropertyDetail />
      <button type="button">Elsewhere</button>
    </>,
  );
  await userEvent.click(activate());
  expect(activate()).toHaveProperty("disabled", true);
}

describe("Activate: focus after the outcome (ADR 0248 §2–§3)", () => {
  it("a failure puts focus back on Activate (#549)", async () => {
    await startActivate();
    act(() => activate().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => write.resolve(failure));
    expect(screen.getByText("Disk full", { exact: false })).toBeTruthy();
    expect(document.activeElement).toBe(activate());
  });

  it("a success puts focus on the same button, now Deactivate (#549)", async () => {
    await startActivate();
    act(() => activate().blur());
    await act(async () => {
      usePortfolioStore.setState({ portfolio });
      write.resolve({ ok: true });
    });
    expect(document.activeElement).toBe(
      bar().getByRole("button", { name: en.propertyDetail.deactivate }),
    );
  });

  it("leaves focus where the user moved it during the write", async () => {
    await startActivate();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => write.resolve(failure));
    expect(activate()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(elsewhere);
  });
});
