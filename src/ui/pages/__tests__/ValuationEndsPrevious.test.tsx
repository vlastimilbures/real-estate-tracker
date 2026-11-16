// @vitest-environment jsdom
//
// ADR 0227 on the real store and a seeded in-memory DB: adding an open-ended valuation
// ends Byt Javorova's open-ended one the day before, with no dialog; a new valuation
// with its own Valid to leaves it open.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValuationsPanel } from "../PropertyEntityPanels";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import type { Sql } from "../../../data/sql";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";

const en = getDict("en");
const d = en.propertyDetail;

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

beforeEach(async () => {
  await act(() => usePortfolioStore.getState().init(openSeeded));
  act(() => useUiStore.setState({ route: "property" }));
});

const javorova = () =>
  usePortfolioStore
    .getState()
    .portfolio!.valuations.filter((v) => v.propertyId === "javorova");
const valuation = (id: string) => javorova().find((v) => v.id === id);
const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

/** The panel on the store's current rows, as Property detail renders it. */
function Live() {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  return (
    <ValuationsPanel
      propertyId="javorova"
      rows={portfolio!.valuations.filter((v) => v.propertyId === "javorova")}
    />
  );
}

async function addValuation(validTo?: string) {
  render(<Live />);
  await userEvent.click(screen.getByRole("button", { name: d.addValuation }));
  await userEvent.type(screen.getByLabelText(d.fieldValidFrom), "01.06.2027");
  if (validTo)
    await userEvent.type(
      screen.getByLabelText(new RegExp(d.fieldValidTo)),
      validTo,
    );
  await userEvent.type(
    screen.getByLabelText(new RegExp(d.fieldMarketValue)),
    "11000000",
  );
  await userEvent.click(screen.getByRole("button", { name: d.addValuation }));
}

describe("adding a valuation ends the previous open-ended one (ADR 0227)", () => {
  it("ends v-javorova on 31.05.2027, with no dialog", async () => {
    expect(valuation("v-javorova")?.validTo).toBeUndefined();
    await addValuation();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(iso(valuation("v-javorova")?.validTo)).toBe("2027-05-31");
    const added = javorova().find((v) => v.id !== "v-javorova")!;
    expect(iso(added.validFrom)).toBe("2027-06-01");
    expect(added.marketValue.toString()).toBe("11000000");
    expect(added.validTo).toBeUndefined();
    expect(screen.getByText("31.05.2027")).toBeTruthy();
  });

  it("a new valuation with its own Valid to leaves v-javorova open", async () => {
    await addValuation("31.12.2027");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(javorova()).toHaveLength(2);
    expect(valuation("v-javorova")?.validTo).toBeUndefined();
    const added = javorova().find((v) => v.id !== "v-javorova")!;
    expect(iso(added.validTo)).toBe("2027-12-31");
  });
});
