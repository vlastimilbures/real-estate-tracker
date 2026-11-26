// @vitest-environment jsdom
//
// ADR 0261 (#467): a failed edit is shown once, where it was started. With the real store
// on a database whose writes fail, a form, a confirm row and Activate show the failure in
// their own place and the page banner stays away; an action with no place of its own
// (Keep exploring, a preset, Duplicate, an Assumptions save) still puts it in the banner.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLayout } from "../../components/AppLayout";
import { PageFrame } from "../../components/PageFrame";
import { EntityPanel } from "../../components/EntityPanel";
import { PropertyFormModal } from "../../components/PropertyFormModal";
import { PropertyDetail } from "../PropertyDetail";
import { Properties } from "../Properties";
import { Scenarios } from "../Scenarios";
import { SettingsPage } from "../Settings";
import { usePortfolioStore, portfolioDb } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { describeWriteError } from "../../model/writeError";
import type { FieldSpec } from "../../model/formParse";
import type { Sql } from "../../../data/sql";
import { openSeeded } from "../../../state/__tests__/support/openSeeded";
import { en } from "../../../i18n/en";

// The compare runs the engine; these tests only need the list.
vi.mock("../ScenarioCompare", () => ({ ScenarioCompareView: () => null }));

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const disk = /disk is full/;
const bannerText = describeWriteError(en, {
  kind: "other",
  message: "disk is full",
}).message;

/** The page banner (PageFrame), not a form's or a row's own error line. */
const pageBanner = () => document.querySelector("#main > .banner.error");

/** The real store on a seeded in-memory DB, run through `before`; then every write fails
 *  and reads still work. */
async function writesFail(
  before: (sql: Sql) => Promise<unknown> = async () => {},
) {
  const sql = await openSeeded();
  await before(sql);
  await act(() => usePortfolioStore.getState().init(async () => sql));
  portfolioDb.set({
    execute: () => Promise.reject(new Error("disk is full")),
    transaction: () => Promise.reject(new Error("disk is full")),
    select: sql.select.bind(sql),
    selectSnapshot: sql.selectSnapshot.bind(sql),
    backup: sql.backup.bind(sql),
  });
}

/** A saved scenario, written straight to the DB. */
const savedScenario = (deltaPa: string) => (sql: Sql) =>
  sql.execute(
    "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
    [
      "s1",
      "Shock",
      `{"version":1,"rateShock":{"deltaPa":"${deltaPa}","durationYears":3}}`,
      "2026-01-01T00:00:00.000Z",
    ],
  );

beforeEach(() => vi.stubGlobal("IntersectionObserver", NoopObserver));
afterEach(() => vi.unstubAllGlobals());

describe("a failed edit shows in place only (ADR 0261 §2)", () => {
  function valuationPanel() {
    const v = usePortfolioStore.getState().portfolio!.valuations[0]!;
    const specs: FieldSpec[] = [
      { name: "value", label: "Value", kind: "money" },
    ];
    render(
      <AppLayout>
        <PageFrame title="Valuations">
          <EntityPanel
            chrome={{
              title: "Valuations",
              addLabel: "valuation",
            }}
            table={{
              rows: [{ id: v.id, value: "1" }],
              columns: [{ head: "Value", left: true, cell: (r) => r.value }],
              onDelete: (id) =>
                usePortfolioStore.getState().removeValuation(id),
            }}
            form={{
              specs,
              draftOf: (r) => ({ value: r ? r.value : "" }),
              build: (values, id) => ({ id, value: String(values.value) }),
              onAdd: async () => ({ ok: true }),
              onSave: () => usePortfolioStore.getState().saveValuation(v),
            }}
          />
        </PageFrame>
      </AppLayout>,
    );
  }

  it("a record form (#467)", async () => {
    await writesFail();
    valuationPanel();
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(screen.getAllByText(disk)).toHaveLength(1);
    expect(pageBanner()).toBeNull();
  });

  it("a confirm-row delete (#467)", async () => {
    await writesFail();
    valuationPanel();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.delete }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(screen.getAllByText(disk)).toHaveLength(1);
    expect(pageBanner()).toBeNull();
  });

  it("the property form (#467)", async () => {
    await writesFail();
    const id = usePortfolioStore.getState().portfolio!.properties[0]!.id;
    render(
      <AppLayout>
        <PageFrame title="Properties">
          <PropertyFormModal mode="edit" propertyId={id} onClose={() => {}} />
        </PageFrame>
      </AppLayout>,
    );
    const name = await screen.findByLabelText(en.propertyForm.name);
    await userEvent.type(name, " 2");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(screen.getAllByText(disk)).toHaveLength(1);
    expect(pageBanner()).toBeNull();
  });

  it("the scenario form (#467)", async () => {
    await writesFail(savedScenario("0.01"));
    act(() => useUiStore.setState({ route: "scenarios" }));
    render(<Scenarios />);
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    await userEvent.type(screen.getByLabelText(en.scenarios.name), " 2");
    await userEvent.click(screen.getByRole("button", { name: en.common.save }));
    expect(screen.getAllByText(disk)).toHaveLength(1);
    expect(pageBanner()).toBeNull();
  });

  it("Activate (#467)", async () => {
    let id = "";
    await writesFail(async (sql) => {
      const [row] = await sql.select<{ id: string }>(
        "SELECT id FROM properties ORDER BY name LIMIT 1",
      );
      id = row!.id;
      await sql.execute("UPDATE properties SET active = 0 WHERE id = ?", [id]);
    });
    act(() =>
      useUiStore.setState({ route: "property", selectedPropertyId: id }),
    );
    render(<PropertyDetail />);
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: en.propertyDetail.activate,
      }),
    );
    expect(screen.getAllByText(disk)).toHaveLength(1);
    expect(pageBanner()).toBeNull();
  });
});

describe("an action with no place of its own keeps the banner (ADR 0261 §3)", () => {
  it("Keep exploring (#467)", async () => {
    await writesFail();
    act(() => useUiStore.setState({ route: "properties" }));
    render(<Properties />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.keepExploring }),
    );
    expect(pageBanner()?.textContent).toBe(bannerText);
  });

  it("adding a preset (#467)", async () => {
    await writesFail();
    act(() => useUiStore.setState({ route: "scenarios", presetsOpen: true }));
    render(<Scenarios />);
    await userEvent.click(
      screen.getByRole("button", { name: en.scenarios.plusPp(2) }),
    );
    expect(pageBanner()?.textContent).toBe(bannerText);
  });

  it("Duplicate, failing to write (#467)", async () => {
    await writesFail(savedScenario("0.01"));
    act(() => useUiStore.setState({ route: "scenarios" }));
    render(<Scenarios />);
    await userEvent.click(
      screen.getByRole("button", { name: en.scenarios.duplicate }),
    );
    expect(pageBanner()?.textContent).toBe(bannerText);
  });

  it("Duplicate, refused by an input rule (#467)", async () => {
    // Saved before ADR 0128: its shock takes the 4.5 % reset rate below 0.
    await writesFail(savedScenario("-0.05"));
    act(() => useUiStore.setState({ route: "scenarios" }));
    render(<Scenarios />);
    await userEvent.click(
      screen.getByRole("button", { name: en.scenarios.duplicate }),
    );
    const error = usePortfolioStore.getState().error;
    expect(error?.kind).toBe("input");
    expect(pageBanner()?.textContent).toBe(
      describeWriteError(en, error!).message,
    );
  });

  it("an Assumptions save failing to write (#467)", async () => {
    await writesFail();
    render(<SettingsPage />);
    const input = screen.getByLabelText(
      new RegExp(
        `^${en.assumptions.inflation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    );
    await userEvent.clear(input);
    await userEvent.type(input, "3");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(pageBanner()?.textContent).toBe(bannerText);
  });
});
