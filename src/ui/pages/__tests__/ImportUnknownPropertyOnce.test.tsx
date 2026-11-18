// @vitest-environment jsdom
//
// ADR 0254 on the real store and a seeded in-memory DB: a child file that names an
// unknown property gets no cell error in its file's table and keeps its row; the name is
// reported once, by the import plan, in the "Import refused" table.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import type { Sql } from "../../../data/sql";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";

const p = en.importPage;
const VH = "property_name,valid_from,valid_to,market_value";
const PH = "name,purchase_date,purchase_price";

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

beforeEach(async () => {
  await act(() => usePortfolioStore.getState().init(openSeeded));
  act(() => useUiStore.setState({ route: "import" }));
});

/** Choose `csv` as the file of the row at `index` (0 properties, 1 valuations). */
async function choose(
  container: HTMLElement,
  index: number,
  name: string,
  csv: string,
) {
  const input = container.querySelectorAll('input[type="file"]')[
    index
  ] as HTMLInputElement;
  await userEvent.upload(input, new File([csv], name, { type: "text/csv" }));
}

describe("an unknown property is reported once, by the import plan (ADR 0254)", () => {
  it("a child file naming an unknown property keeps its row and the plan lists the name once", async () => {
    const { container } = render(<Import />);
    await choose(
      container,
      1,
      "valuations.csv",
      `${VH}\nByt Javorova,2027-06-01,,12000000\nByt Neexistujici,2027-06-01,,9000000\n`,
    );

    // The parser keeps both rows: no cell error, the file reads as ready.
    expect(await screen.findByText(p.rowsReady(2))).toBeTruthy();
    expect(screen.queryByText(p.errorsBadge(1))).toBeNull();
    expect(screen.queryByText(p.fixErrors)).toBeNull();

    // The plan refuses the name, once.
    const refused = await screen.findByRole("region", {
      name: p.importRefused,
    });
    expect(
      within(refused).getByText(p.errUnknownProperty("Byt Neexistujici")),
    ).toBeTruthy();
    expect(
      screen.getAllByText(p.errUnknownProperty("Byt Neexistujici")),
    ).toHaveLength(1);
  });

  it("a child row whose property's own row has an error gets no knock-on error", async () => {
    const { container } = render(<Import />);
    // Byt Nova's properties row has no price, so the parser drops it.
    await choose(
      container,
      0,
      "properties.csv",
      `${PH}\nByt Nova,2020-01-01,\n`,
    );
    await choose(
      container,
      1,
      "valuations.csv",
      `${VH}\nByt Nova,2027-06-01,,9000000\n`,
    );

    // Only the properties file's own error; the valuations row is kept.
    expect(await screen.findByText(p.rowsReady(1))).toBeTruthy();
    expect(screen.getAllByText(p.errorsBadge(1))).toHaveLength(1);
    expect(screen.queryByText(p.errUnknownProperty("Byt Nova"))).toBeNull();
  });
});
