// The row actions (valuations, leases, mortgage blocks, holding costs) on the happy path.
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { isoDate, rate, mortgageBlock } from "../../engine";
import type { IsoDate } from "../../engine";
import { money } from "../../engine";
import { openSeeded } from "./support/openSeeded";

// Every mutation, invoked once on the happy path — a smoke test that each action's
// mapper + repository call round-trips through the DB and the refreshed in-memory state
// (a bad mapper would surface here). The shared mutate() failure path is covered in storeWrites.test.ts.
describe("portfolioStore mutations — happy path (all actions)", () => {
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

  const pf = () => usePortfolioStore.getState().portfolio!;
  const pid = () => pf().properties[0].id;

  it("addValuation / saveValuation / removeValuation", async () => {
    const add = await usePortfolioStore.getState().addValuation({
      id: "v-new",
      propertyId: pid(),
      validFrom: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      marketValue: money("15000000"),
    });
    expect(add.ok).toBe(true);
    expect(pf().valuations.some((v) => v.id === "v-new")).toBe(true);

    const save = await usePortfolioStore.getState().saveValuation({
      id: "v-new",
      propertyId: pid(),
      validFrom: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      marketValue: money("16000000"),
    });
    expect(save.ok).toBe(true);
    expect(
      pf()
        .valuations.find((v) => v.id === "v-new")!
        .marketValue.toString(),
    ).toBe("16000000");

    const remove = await usePortfolioStore.getState().removeValuation("v-new");
    expect(remove.ok).toBe(true);
    expect(pf().valuations.some((v) => v.id === "v-new")).toBe(false);
  });

  it("addLease / saveLease / removeLease", async () => {
    const add = await usePortfolioStore.getState().addLease({
      id: "l-new",
      propertyId: pid(),
      startDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      monthlyRent: money("40000"),
    });
    expect(add.ok).toBe(true);
    expect(pf().leases.some((l) => l.id === "l-new")).toBe(true);
    // ADR 0163: the property's open lease ends the day before the new one starts.
    expect(
      pf()
        .leases.filter((l) => l.propertyId === pid() && l.id !== "l-new")
        .map((l) => l.endDate?.toISOString().slice(0, 10)),
    ).toContain("2029-12-31");

    const save = await usePortfolioStore.getState().saveLease({
      id: "l-new",
      propertyId: pid(),
      startDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      monthlyRent: money("41000"),
    });
    expect(save.ok).toBe(true);
    expect(
      pf()
        .leases.find((l) => l.id === "l-new")!
        .monthlyRent.toString(),
    ).toBe("41000");

    const remove = await usePortfolioStore.getState().removeLease("l-new");
    expect(remove.ok).toBe(true);
    expect(pf().leases.some((l) => l.id === "l-new")).toBe(false);
  });

  it("addMortgageBlock / saveMortgageBlock / removeMortgageBlock", async () => {
    const block = {
      id: "m-new",
      propertyId: pid(),
      startDate: new Date(Date.UTC(2030, 0, 1)) as IsoDate,
      initialPrincipal: money("1000000"),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("5000"),
    };
    const add = await usePortfolioStore.getState().addMortgageBlock(block);
    expect(add.ok).toBe(true);
    expect(pf().mortgages.some((m) => m.id === "m-new")).toBe(true);

    const save = await usePortfolioStore
      .getState()
      .saveMortgageBlock({ ...block, monthlyInstalment: money("5500") });
    expect(save.ok).toBe(true);
    expect(
      pf()
        .mortgages.find((m) => m.id === "m-new")!
        .monthlyInstalment.toString(),
    ).toBe("5500");

    const remove = await usePortfolioStore
      .getState()
      .removeMortgageBlock("m-new");
    expect(remove.ok).toBe(true);
    expect(pf().mortgages.some((m) => m.id === "m-new")).toBe(false);
  });

  it("editing a plain block into a development loan: blocked without a term, persists with one", async () => {
    // Reproduces the reported flow: take a seed mortgage (no loanTermYears), add draws
    // + a completion date. Without a term the write must fail (surfaced, not silent);
    // with a term it saves and the tranches round-trip through the DB.
    const existing = pf().mortgages[0];
    expect(existing.loanTermYears).toBeUndefined();
    const draws = [
      { date: isoDate("2026-09-01"), amount: money("2300000") },
      { date: isoDate("2028-04-05"), amount: money("4000000") },
      { date: isoDate("2028-10-10"), amount: money("700000") },
    ];
    const completionDate = isoDate("2028-10-10");

    const blocked = await usePortfolioStore.getState().saveMortgageBlock(
      mortgageBlock({
        ...existing,
        draws,
        completionDate,
      }),
    ); // deliberately invalid (no term)
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("expected failure");
    // UX-047: the engine rule, on the loan-term field (was an English-only message).
    expect(blocked.error).toEqual({
      kind: "input",
      errors: [
        {
          code: "MISSING_TERM_FOR_DEV_LOAN",
          entity: "mortgage",
          id: existing.id,
          field: "loanTermYears",
        },
      ],
    });

    const ok = await usePortfolioStore.getState().saveMortgageBlock({
      ...existing,
      loanTermYears: 30,
      draws,
      completionDate,
    });
    expect(ok.ok).toBe(true);
    const reloaded = pf().mortgages.find((m) => m.id === existing.id)!;
    expect(reloaded.draws?.length).toBe(3);
    expect(reloaded.draws![0].amount.toString()).toBe("2300000");
    expect(reloaded.completionDate?.getTime()).toBe(completionDate.getTime());
  });

  it("a broken input rule is only returned: the banner stays empty (#125)", async () => {
    // ADR 0141: the form that submitted the write shows the refusal itself.
    const existing = pf().mortgages[0];
    const blocked = await usePortfolioStore.getState().saveMortgageBlock(
      mortgageBlock({
        ...existing,
        draws: [{ date: isoDate("2026-09-01"), amount: money("2300000") }],
        completionDate: isoDate("2028-10-10"),
      }),
    ); // deliberately invalid (no term)
    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? null : blocked.error.kind).toBe("input");
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("saveHoldingCost updates an existing row", async () => {
    const existing = pf().holdingCosts.find((h) => h.propertyId === pid())!;
    const result = await usePortfolioStore
      .getState()
      .saveHoldingCost({ ...existing, svjMonthly: money("1500") });
    expect(result.ok).toBe(true);
    expect(
      pf()
        .holdingCosts.find((h) => h.id === existing.id)!
        .svjMonthly!.toString(),
    ).toBe("1500");
  });
});
