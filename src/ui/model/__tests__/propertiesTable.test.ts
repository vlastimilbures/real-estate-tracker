// What each Properties row shows. A pending purchase has no figures yet (ADR 0156);
// its debt is still shown once a tranche is drawn, as the Dashboard's total debt counts
// it (ADR 0165).
import { describe, it, expect } from "vitest";
import { D } from "../../../lib/money";
import { propertiesTableRows } from "../propertiesTable";

const row = (owned: boolean, debt: string) => ({ owned, debt: D(debt) });

describe("propertiesTableRows (ADR 0156, ADR 0165)", () => {
  it("shows every figure of an owned property, with or without debt", () => {
    expect(
      propertiesTableRows([row(true, "1000"), row(true, "0")]).map(
        (r) => r.show,
      ),
    ).toEqual([
      { figures: true, debt: true },
      { figures: true, debt: true },
    ]);
  });

  it("shows nothing of a pending purchase with nothing drawn", () => {
    expect(propertiesTableRows([row(false, "0")])[0]?.show).toEqual({
      figures: false,
      debt: false,
    });
  });

  it("shows only the debt of a pending purchase with a drawn tranche", () => {
    expect(propertiesTableRows([row(false, "500000")])[0]?.show).toEqual({
      figures: false,
      debt: true,
    });
  });

  it("keeps the row's own fields", () => {
    const [r] = propertiesTableRows([{ ...row(true, "1"), name: "A" }]);
    expect(r?.name).toBe("A");
    expect(r?.debt.toString()).toBe("1");
  });
});
