import { describe, it, expect } from "vitest";
import { importReportRows } from "../importReport";
import { getDict } from "../../../i18n";

describe("importReportRows (UX-034)", () => {
  it("labels each table with its translated title, in file order", () => {
    const cs = getDict("cs");
    const rows = importReportRows(cs, {
      properties: 2,
      valuations: 3,
      leases: 1,
      mortgage_blocks: 4,
    });
    expect(rows).toEqual([
      {
        label: cs.importPage.propertiesTitle,
        value: cs.importPage.upserted(2),
      },
      {
        label: cs.importPage.valuationsTitle,
        value: cs.importPage.upserted(3),
      },
      { label: cs.importPage.rentsTitle, value: cs.importPage.upserted(1) },
      { label: cs.importPage.mortgagesTitle, value: cs.importPage.upserted(4) },
    ]);
  });

  it("no longer says 'upserted' in English", () => {
    expect(getDict("en").importPage.upserted(2)).not.toContain("upserted");
  });
});
