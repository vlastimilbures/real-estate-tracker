// Typed write errors from the store (UX-046, DR-133).
import { describe, expect, it } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { noExtras } from "../../data/__tests__/support/noExtras";
import { openSeeded } from "./support/openSeeded";

describe("portfolioStore typed write errors (UX-046, DR-133)", () => {
  it("a duplicate property name returns the constraint, not SQLite's text", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const existing = usePortfolioStore.getState().portfolio!.properties[0];
    const result = await usePortfolioStore
      .getState()
      .addProperty(
        { ...existing, id: "dup-name" },
        { id: "hc-dup-name", propertyId: "dup-name" },
        noExtras,
      );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "constraint",
        constraint: { kind: "unique", table: "properties", columns: ["name"] },
      },
    });
    expect(usePortfolioStore.getState().error).toEqual(
      result.ok ? null : result.error,
    );
  });

  it("deleting a record that is gone returns ROW_MISSING", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const result = await usePortfolioStore
      .getState()
      .removeLease("no-such-lease");
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "data",
        code: "ROW_MISSING",
        details: ["leases no-such-lease"],
      },
    });
  });
});
