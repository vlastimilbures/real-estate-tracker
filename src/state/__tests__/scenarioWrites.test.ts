// Assumption and scenario writes (ADR 0123).
import { beforeEach, describe, expect, it } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { rate } from "../../engine";
import { setClock } from "../../__tests__/support/clock";
import { openSeeded } from "./support/openSeeded";

// Every mutation, invoked once on the happy path — a smoke test that each action's
// mapper + repository call round-trips through the DB and the refreshed in-memory state
// (a bad mapper would surface here). The shared mutate() failure path is covered in storeWrites.test.ts.
describe("portfolioStore mutations — happy path (all actions)", () => {
  beforeEach(async () => {
    await usePortfolioStore.getState().init(openSeeded);
  });

  it("saveAssumptions persists changed assumptions", async () => {
    const a = usePortfolioStore.getState().assumptions!;
    const result = await usePortfolioStore
      .getState()
      .saveAssumptions({ ...a, horizonYears: 25 });
    expect(result.ok).toBe(true);
    expect(usePortfolioStore.getState().assumptions!.horizonYears).toBe(25);
  });
});

// ADR 0123 (#107, #108): scenario writes.
describe("portfolioStore scenario writes (ADR 0123)", () => {
  const createdAt = async (id: string) =>
    (
      await portfolioDb.get()!.select<{
        created_at: string;
      }>("SELECT created_at FROM scenarios WHERE id = ?", [id])
    )[0]?.created_at;

  it("an add stamps created_at; a save keeps it", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const s = { id: "s1", name: "Stress", overrides: {} };
    expect(await usePortfolioStore.getState().addScenario(s)).toEqual({
      ok: true,
    });
    const stamped = await createdAt("s1");
    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // The clock stands still (setup/clock.ts): move it, so a re-stamp on save would show.
    setClock("2026-10-02");
    await usePortfolioStore.getState().saveScenario({ ...s, name: "Renamed" });
    expect(await createdAt("s1")).toBe(stamped);
    expect(usePortfolioStore.getState().scenarios.map((x) => x.name)).toEqual([
      "Renamed",
    ]);
  });
});

// ADR 0123 (#108): a scenario write runs the engine's assumption rules on the scenario's
// own overrides before anything is written, like saveAssumptions (UX-047).
describe("portfolioStore refuses a scenario that breaks an engine rule (ADR 0123)", () => {
  const storedIds = async () =>
    (
      await portfolioDb
        .get()!
        .select<{ id: string }>("SELECT id FROM scenarios ORDER BY id")
    ).map((r) => r.id);

  it.each([
    [
      "a vacancy of 150 %",
      { vacancyAllowance: rate("1.5") },
      "RATE_OUT_OF_RANGE",
      "vacancyAllowance",
    ],
    [
      "a crash typed as −20 %",
      { valueShock: { pct: rate("-0.2"), atYear: 0 } },
      "SHOCK_OUT_OF_RANGE",
      "valueShock",
    ],
  ] as const)(
    "add and save refuse %s, nothing written",
    async (_, overrides, code, field) => {
      await usePortfolioStore.getState().init(openSeeded);
      const refused = {
        ok: false,
        error: { kind: "input", errors: [{ code, field }] },
      };
      const store = () => usePortfolioStore.getState();
      expect(
        await store().addScenario({ id: "bad", name: "Bad", overrides }),
      ).toMatchObject(refused);
      expect(await storedIds()).toEqual([]);

      await store().addScenario({ id: "s1", name: "Fine", overrides: {} });
      expect(
        await store().saveScenario({ id: "s1", name: "Fine", overrides }),
      ).toMatchObject(refused);
      expect(
        await portfolioDb.get()!.select("SELECT overrides FROM scenarios"),
      ).toEqual([{ overrides: '{"version":1}' }]);
    },
  );

  it("stores a duplicate under the name the caller gives (#169)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    await portfolioDb
      .get()!
      .execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        ["old", "Stres", '{"version":1}', "2026-01-01T00:00:00.000Z"],
      );
    await usePortfolioStore.getState().refresh();
    const r = await usePortfolioStore
      .getState()
      .duplicateScenario("old", "copy", "Stres (kopie)");
    expect(r).toEqual({ ok: true });
    await usePortfolioStore.getState().refresh();
    const copy = usePortfolioStore
      .getState()
      .scenarios.find((x) => x.id === "copy");
    expect(copy?.name).toBe("Stres (kopie)");
  });

  it("refuses to duplicate a stored scenario that breaks a rule", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    await portfolioDb
      .get()!
      .execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        [
          "old",
          "Old",
          '{"version":1,"vacancyAllowance":"1.5"}',
          "2026-01-01T00:00:00.000Z",
        ],
      );
    await usePortfolioStore.getState().refresh();
    const r = await usePortfolioStore
      .getState()
      .duplicateScenario("old", "copy", "Old (copy)");
    expect(r).toMatchObject({
      ok: false,
      error: { kind: "input", errors: [{ code: "RATE_OUT_OF_RANGE" }] },
    });
    expect(await storedIds()).toEqual(["old"]);
  });
});
