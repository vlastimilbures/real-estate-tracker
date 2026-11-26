// @vitest-environment jsdom
//
// ADR 0227 (amends ADR 0099, 0144): adding an open-ended valuation after an open-ended
// one ends that one on the day before the new start, with no dialog. The panel hands the
// record to the store's add; the store ends the previous one (EndPrevious.test.tsx runs
// both on a database). An edit and a refused add change no other row (#436).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValuationsPanel, LeasesPanel } from "../PropertyEntityPanels";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { isoDate, money, type Lease, type Valuation } from "../../../engine";

const ok = async (): Promise<MutationResult> => ({ ok: true });
const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

const valuations: Valuation[] = [
  {
    id: "v-old",
    propertyId: "p1",
    validFrom: isoDate("2025-01-01"),
    marketValue: money("5000000"),
  },
];
const leases: Lease[] = [
  {
    id: "l-old",
    propertyId: "p1",
    startDate: isoDate("2025-01-01"),
    monthlyRent: money("15000"),
  },
];

const spies = {
  addValuation: vi.fn(ok),
  saveValuation: vi.fn(ok),
  addLease: vi.fn(ok),
};

beforeEach(() =>
  act(() => {
    Object.values(spies).forEach((s) => s.mockReset().mockImplementation(ok));
    usePortfolioStore.setState(spies);
    useUiStore.setState({ route: "property" });
  }),
);

/** The add form is open (its Valid from field shows). */
const formOpen = () =>
  screen.queryByLabelText(en.propertyDetail.fieldValidFrom) !== null;

async function add(
  user: ReturnType<typeof userEvent.setup>,
  addLabel: string,
  dateLabel: string,
  amountLabel: string,
  endLabel?: string,
) {
  await user.click(screen.getByRole("button", { name: addLabel }));
  await user.type(screen.getByLabelText(dateLabel), "01.07.2026");
  if (endLabel)
    await user.type(screen.getByLabelText(new RegExp(endLabel)), "30.06.2027");
  await user.type(screen.getByLabelText(new RegExp(amountLabel)), "6000000");
  await user.click(
    // The form's submit reads as the panel's Add (ADR 0201 §2).
    screen.getByRole("button", { name: addLabel }),
  );
}

describe("ending the previous open-ended record (ADR 0227, 0163)", () => {
  it("valuation: adds without asking", async () => {
    const user = userEvent.setup();
    render(<ValuationsPanel propertyId="p1" rows={valuations} />);
    await add(
      user,
      en.propertyDetail.addValuation,
      en.propertyDetail.fieldValidFrom,
      en.propertyDetail.fieldMarketValue,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spies.addValuation).toHaveBeenCalledTimes(1);
    const [added] = spies.addValuation.mock.calls[0] as unknown as [Valuation];
    expect(iso(added.validFrom)).toBe("2026-07-01");
    expect(added.validTo).toBeUndefined();
    expect(formOpen()).toBe(false);
  });

  // ADR 0163: leases never overlap, so there is no choice to make. The panel adds the
  // lease and the store ends the open lease before it (state/__tests__/closePrevious).
  it("lease: adds without asking", async () => {
    const user = userEvent.setup();
    render(<LeasesPanel propertyId="p1" rows={leases} />);
    await add(
      user,
      en.propertyDetail.addLease,
      en.propertyDetail.fieldStartDate,
      en.propertyDetail.fieldMonthlyRent,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spies.addLease).toHaveBeenCalledTimes(1);
    const [added] = spies.addLease.mock.calls[0] as unknown as [Lease];
    expect(iso(added.startDate)).toBe("2026-07-01");
  });

  it("adds plainly when the new record starts before the open one", async () => {
    const user = userEvent.setup();
    render(
      <ValuationsPanel
        propertyId="p1"
        rows={[{ ...valuations[0]!, validFrom: isoDate("2027-01-01") }]}
      />,
    );
    await add(
      user,
      en.propertyDetail.addValuation,
      en.propertyDetail.fieldValidFrom,
      en.propertyDetail.fieldMarketValue,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spies.addValuation).toHaveBeenCalledTimes(1);
  });

  // ADR 0144, 0227: a dated new record changes no other row. Ending the previous one would
  // drop it from after the new end date, so it is added and the previous one is left as is.
  it("valuation: adds plainly when the new one has an end date (#121)", async () => {
    const user = userEvent.setup();
    render(<ValuationsPanel propertyId="p1" rows={valuations} />);
    await add(
      user,
      en.propertyDetail.addValuation,
      en.propertyDetail.fieldValidFrom,
      en.propertyDetail.fieldMarketValue,
      en.propertyDetail.fieldValidTo,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spies.addValuation).toHaveBeenCalledTimes(1);
    const [added] = spies.addValuation.mock.calls[0] as unknown as [Valuation];
    expect(iso(added.validTo)).toBe("2027-06-30");
  });

  it("lease: adds plainly when the new one has an end date (#121)", async () => {
    const user = userEvent.setup();
    render(<LeasesPanel propertyId="p1" rows={leases} />);
    await add(
      user,
      en.propertyDetail.addLease,
      en.propertyDetail.fieldStartDate,
      en.propertyDetail.fieldMonthlyRent,
      en.propertyDetail.fieldEndDate,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spies.addLease).toHaveBeenCalledTimes(1);
    const [added] = spies.addLease.mock.calls[0] as unknown as [Lease];
    expect(iso(added.endDate)).toBe("2027-06-30");
  });

  it("editing a valuation changes no other row", async () => {
    const user = userEvent.setup();
    const older: Valuation = {
      id: "v-older",
      propertyId: "p1",
      validFrom: isoDate("2024-01-01"),
      marketValue: money("4000000"),
    };
    render(<ValuationsPanel propertyId="p1" rows={[...valuations, older]} />);
    await user.click(
      screen.getAllByRole("button", { name: en.common.edit })[0]!,
    );
    const value = screen.getByLabelText(
      new RegExp(en.propertyDetail.fieldMarketValue),
    );
    await user.clear(value);
    await user.type(value, "5500000");
    await user.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(spies.saveValuation).toHaveBeenCalledTimes(1);
    expect(spies.addValuation).not.toHaveBeenCalled();
  });

  // #436: the old dialog's Cancel closed the form with nothing saved. A refused add now
  // keeps the form open, its input typed and its leave guard set.
  it("a refused add keeps the form open and unsaved", async () => {
    const refused: MutationResult = {
      ok: false,
      error: { kind: "other", message: "disk is full" },
    };
    spies.addValuation.mockImplementation(async () => refused);
    const user = userEvent.setup();
    render(<ValuationsPanel propertyId="p1" rows={valuations} />);
    await add(
      user,
      en.propertyDetail.addValuation,
      en.propertyDetail.fieldValidFrom,
      en.propertyDetail.fieldMarketValue,
    );
    expect(spies.addValuation).toHaveBeenCalledTimes(1);
    expect(formOpen()).toBe(true);
    expect(
      (
        screen.getByLabelText(
          new RegExp(en.propertyDetail.fieldMarketValue),
        ) as HTMLInputElement
      ).value.replace(/\D/g, ""),
    ).toBe("6000000");
    expect(screen.getByText(en.common.unsavedChanges)).toBeTruthy();
    expect(useUiStore.getState().unsavedChanges).toBe(true);
  });
});
