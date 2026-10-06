// @vitest-environment jsdom
//
// ADR 0099: adding a valuation or lease after an open-ended one asks to end that one
// on the day before the new start; confirming sends it with that end date.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValuationsPanel, LeasesPanel } from "../PropertyEntityPanels";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { isoDate, money, type Lease, type Valuation } from "../../../engine";

const ok = async () => ({ ok: true as const });
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
  addValuationClosingPrevious: vi.fn(ok),
  addLease: vi.fn(ok),
  addLeaseClosingPrevious: vi.fn(ok),
};

beforeEach(() =>
  act(() => {
    Object.values(spies).forEach((s) => s.mockClear());
    usePortfolioStore.setState(spies);
    useUiStore.setState({ language: "en" });
  }),
);

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
    screen.getByRole("button", {
      name: `${en.common.addVerb} ${addLabel}`,
    }),
  );
}

describe("ending the previous open-ended record (ADR 0099)", () => {
  it("valuation: asks, then ends the previous one the day before", async () => {
    const user = userEvent.setup();
    render(<ValuationsPanel propertyId="p1" rows={valuations} />);
    await add(
      user,
      en.propertyDetail.addValuation,
      en.propertyDetail.fieldValidFrom,
      en.propertyDetail.fieldMarketValue,
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      en.propertyDetail.closePrevValuationBody("01.01.2025", "30.06.2026"),
    );
    await user.click(
      screen.getByRole("button", { name: en.propertyDetail.closePrevConfirm }),
    );
    const [added, closed] = spies.addValuationClosingPrevious.mock
      .calls[0] as unknown as [Valuation, Valuation];
    expect(iso(added.validFrom)).toBe("2026-07-01");
    expect(closed.id).toBe("v-old");
    expect(iso(closed.validTo)).toBe("2026-06-30");
    expect(spies.addValuation).not.toHaveBeenCalled();
  });

  it("lease: Keep as is adds without touching the previous one", async () => {
    const user = userEvent.setup();
    render(<LeasesPanel propertyId="p1" rows={leases} />);
    await add(
      user,
      en.propertyDetail.addLease,
      en.propertyDetail.fieldStartDate,
      en.propertyDetail.fieldMonthlyRent,
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      en.propertyDetail.closePrevLeaseBody("01.01.2025", "30.06.2026"),
    );
    await user.click(
      screen.getByRole("button", { name: en.propertyDetail.closePrevKeep }),
    );
    expect(spies.addLease).toHaveBeenCalledTimes(1);
    expect(spies.addLeaseClosingPrevious).not.toHaveBeenCalled();
  });

  it("lease: confirming ends the previous lease the day before", async () => {
    const user = userEvent.setup();
    render(<LeasesPanel propertyId="p1" rows={leases} />);
    await add(
      user,
      en.propertyDetail.addLease,
      en.propertyDetail.fieldStartDate,
      en.propertyDetail.fieldMonthlyRent,
    );
    await user.click(
      screen.getByRole("button", { name: en.propertyDetail.closePrevConfirm }),
    );
    const [, closed] = spies.addLeaseClosingPrevious.mock
      .calls[0] as unknown as [Lease, Lease];
    expect(iso(closed.endDate)).toBe("2026-06-30");
  });

  it("does not ask when the new record starts before the open one", async () => {
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

  // ADR 0144: a dated new record does not ask. Ending the previous one would drop it from
  // after the new end date, so it is added and the previous record is left as it is.
  it("valuation: does not ask when the new one has an end date (#121)", async () => {
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
    expect(spies.addValuationClosingPrevious).not.toHaveBeenCalled();
  });

  it("lease: does not ask when the new one has an end date (#121)", async () => {
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
    expect(spies.addLeaseClosingPrevious).not.toHaveBeenCalled();
  });
});
