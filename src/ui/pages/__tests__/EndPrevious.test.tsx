// @vitest-environment jsdom
//
// What adding a record does to the one before it, end to end: the panel, the store and
// an in-memory database. ADR 0227: an open-ended valuation ends the open-ended one before
// it the day before (ADR 0144: a dated one changes no other row). ADR 0163: a lease ends
// the open lease before it, dated or not, and a lease that would overlap is refused.
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeasesPanel, ValuationsPanel } from "../PropertyEntityPanels";
import { portfolioDb, usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { propertyRecords } from "../../model/propertyRecords";
import { en } from "../../../i18n/en";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import type { Sql } from "../../../data/sql";

const store = () => usePortfolioStore.getState();
const d = en.propertyDetail;

/** The store on a fresh seeded database, `prepare` run on it first. */
async function reset(prepare?: (sql: Sql) => Promise<void>) {
  portfolioDb.set(null);
  usePortfolioStore.setState({
    portfolio: null,
    assumptions: null,
    status: { kind: "idle" },
    error: null,
  });
  await store().init(async () => {
    const sql = openMemorySql();
    await migrate(sql);
    await seedIfEmpty(sql);
    await prepare?.(sql);
    return sql;
  });
}

beforeEach(async () => {
  await reset();
  act(() => useUiStore.setState({ route: "property" }));
});

/** The panels as Property detail renders them: rows from the store's portfolio. */
function Valuations({ id }: { id: string }) {
  const p = usePortfolioStore((s) => s.portfolio);
  return (
    <ValuationsPanel propertyId={id} rows={propertyRecords(p, id).valuations} />
  );
}
function Leases({ id }: { id: string }) {
  const p = usePortfolioStore((s) => s.portfolio);
  return <LeasesPanel propertyId={id} rows={propertyRecords(p, id).leases} />;
}

type Kind = "valuation" | "lease";
const FIELDS = {
  valuation: {
    add: d.addValuation,
    start: d.fieldValidFrom,
    end: d.fieldValidTo,
    amount: d.fieldMarketValue,
  },
  lease: {
    add: d.addLease,
    start: d.fieldStartDate,
    end: d.fieldEndDate,
    amount: d.fieldMonthlyRent,
  },
};

/** Fill and submit the add form; `end` blank leaves the record open-ended. */
async function add(kind: Kind, start: string, end?: string) {
  const f = FIELDS[kind];
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: f.add }));
  await user.type(screen.getByLabelText(f.start), start);
  if (end) await user.type(screen.getByLabelText(new RegExp(f.end)), end);
  await user.type(screen.getByLabelText(new RegExp(f.amount)), "30000");
  await user.click(screen.getByRole("button", { name: f.add }));
}

const formOpen = (kind: Kind) =>
  screen.queryByLabelText(FIELDS[kind].start) !== null;
/** The note under the start field: where a refused add says why. */
const startNote = (kind: Kind) => {
  const id = screen
    .getByLabelText(FIELDS[kind].start)
    .getAttribute("aria-describedby");
  return id ? document.getElementById(id)?.textContent : undefined;
};
const day = (x: Date | undefined) => x?.toISOString().slice(0, 10) ?? null;
/** One property's rows as [start, end], by start. */
const spans = (kind: Kind, id: string) => {
  const p = store().portfolio!;
  const rows =
    kind === "valuation"
      ? p.valuations.map((v) => [v.propertyId, v.validFrom, v.validTo] as const)
      : p.leases.map((l) => [l.propertyId, l.startDate, l.endDate] as const);
  return rows
    .filter(([pid]) => pid === id)
    .map(([, s, e]) => [day(s), day(e)])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
};

describe("adding a valuation after another (ADR 0227, 0144)", () => {
  // javorova: the seed's v-javorova is open-ended from 2026-06-01.
  it("an open-ended one ends the open-ended one before it the day before", async () => {
    render(<Valuations id="javorova" />);
    await add("valuation", "01.07.2026");
    expect(formOpen("valuation")).toBe(false);
    expect(spans("valuation", "javorova")).toEqual([
      ["2026-06-01", "2026-06-30"],
      ["2026-07-01", null],
    ]);
  });

  it("a dated one leaves the one before it open", async () => {
    render(<Valuations id="javorova" />);
    await add("valuation", "01.07.2026", "30.06.2027");
    expect(formOpen("valuation")).toBe(false);
    expect(spans("valuation", "javorova")).toEqual([
      ["2026-06-01", null],
      ["2026-07-01", "2027-06-30"],
    ]);
  });

  it("one on the same start day ends nothing and is refused", async () => {
    render(<Valuations id="javorova" />);
    await add("valuation", "01.06.2026");
    expect(formOpen("valuation")).toBe(true);
    expect(spans("valuation", "javorova")).toEqual([["2026-06-01", null]]);
    expect(startNote("valuation")).toMatchInlineSnapshot(
      `"This property already has a valuation from this date"`,
    );
  });

  it("one starting before the open-ended one ends nothing", async () => {
    render(<Valuations id="javorova" />);
    await add("valuation", "01.01.2026");
    expect(spans("valuation", "javorova")).toEqual([
      ["2026-01-01", null],
      ["2026-06-01", null],
    ]);
  });

  it("one before it already ended later is kept as it is", async () => {
    await reset(async (sql) => {
      await sql.execute(
        "UPDATE valuations SET valid_to = '2027-12-31' WHERE id = 'v-javorova'",
      );
    });
    render(<Valuations id="javorova" />);
    await add("valuation", "01.07.2026");
    expect(spans("valuation", "javorova")).toEqual([
      ["2026-06-01", "2027-12-31"],
      ["2026-07-01", null],
    ]);
  });
});

describe("adding a lease after another (ADR 0163)", () => {
  // javorova: the seed's l-javorova is open-ended from 2025-09-01.
  it("an open-ended one ends the open lease before it the day before", async () => {
    render(<Leases id="javorova" />);
    await add("lease", "01.07.2026");
    expect(formOpen("lease")).toBe(false);
    expect(spans("lease", "javorova")).toEqual([
      ["2025-09-01", "2026-06-30"],
      ["2026-07-01", null],
    ]);
  });

  it("a dated one ends the open lease before it too", async () => {
    render(<Leases id="javorova" />);
    await add("lease", "01.07.2026", "30.06.2027");
    expect(formOpen("lease")).toBe(false);
    expect(spans("lease", "javorova")).toEqual([
      ["2025-09-01", "2026-06-30"],
      ["2026-07-01", "2027-06-30"],
    ]);
  });

  it("one on the same start day is refused and writes nothing", async () => {
    render(<Leases id="javorova" />);
    await add("lease", "01.09.2025");
    expect(formOpen("lease")).toBe(true);
    expect(spans("lease", "javorova")).toEqual([["2025-09-01", null]]);
    expect(startNote("lease")).toMatchInlineSnapshot(
      `"This lease overlaps another lease of the same property. Leases cannot overlap: end the earlier lease before the later one starts"`,
    );
  });

  // lipova: l-lipova-1 runs to 2026-08-30, l-lipova-2 is open from 2026-09-01.
  it("one inside a lease already ended later is refused and writes nothing", async () => {
    render(<Leases id="lipova" />);
    await add("lease", "01.07.2026");
    expect(formOpen("lease")).toBe(true);
    expect(spans("lease", "lipova")).toEqual([
      ["2025-09-01", "2026-08-30"],
      ["2026-09-01", null],
    ]);
    expect(startNote("lease")).toMatchInlineSnapshot(
      `"This lease overlaps another lease of the same property. Leases cannot overlap: end the earlier lease before the later one starts"`,
    );
  });
});
