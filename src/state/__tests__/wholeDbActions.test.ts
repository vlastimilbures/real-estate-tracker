// The store's whole-database actions (DR-047).
import { describe, expect, it } from "vitest";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import type { IsoDate } from "../../engine";
import type { Sql } from "../../data/sql";
import { CHANGED_SINCE_BACKUP } from "../../data/appMeta";
import { parseProperties, parseRents } from "../../import/csv";
import { money } from "../../engine";
import { importNow } from "./support/importNow";
import { openSeeded } from "./support/openSeeded";
import { unwrap } from "../../__tests__/support/result";

describe("portfolioStore whole-database actions (DR-047)", () => {
  it("importCsv writes, reloads, and leaves the banner alone", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const before = usePortfolioStore.getState().portfolio!.properties.length;
    const report = unwrap(
      await importNow({
        properties: parseProperties(
          "name,purchase_date,purchase_price\nStore Import,2020-01-01,1000000",
        ).rows,
      }),
    );
    expect(report.items.map((i) => i.kind)).toEqual(["add"]);
    expect(usePortfolioStore.getState().portfolio!.properties.length).toBe(
      before + 1,
    );
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("importCsv rethrows a refused file unchanged and writes nothing", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const before = usePortfolioStore.getState().portfolio!;
    await expect(
      importNow({
        rents: parseRents(
          "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
        ).rows,
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: "planRefused" } });
    expect(usePortfolioStore.getState().portfolio!.leases.length).toBe(
      before.leases.length,
    );
    expect(usePortfolioStore.getState().error).toBeNull();
  });

  it("importCsv waits for a pending mutation (one queue, DR-085)", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    const real = portfolioDb.get()!;
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: Sql = {
      ...real,
      select: real.select.bind(real),
      backup: real.backup.bind(real),
      execute: async (q, p) => {
        log.push(p?.[0] === CHANGED_SINCE_BACKUP ? "changed" : "valuation");
        await gate;
        return real.execute(q, p);
      },
      transaction: async (stmts) => {
        log.push("import");
        return real.transaction(stmts);
      },
    };
    // Previewed before the gate, so only importCsv itself can wait in the queue.
    const batch = {
      properties: parseProperties(
        "name,purchase_date,purchase_price\nQueued Import,2020-01-01,1",
      ).rows,
    };
    unwrap(await usePortfolioStore.getState().previewCsv(batch));
    portfolioDb.set(slow);
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const a = usePortfolioStore.getState().addValuation({
      id: "queued",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2033, 0, 1)) as IsoDate,
      marketValue: money("1"),
    });
    const b = usePortfolioStore.getState().importCsv(batch);
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["valuation"]);
    release();
    await a;
    await b;
    // Each write is followed by its "changed since backup" mark (ADR 0110).
    expect(log).toEqual(["valuation", "changed", "import", "changed"]);
  });

  it("a failed whole-database action does not block later mutations", async () => {
    await usePortfolioStore.getState().init(openSeeded);
    await expect(
      importNow({
        rents: parseRents(
          "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
        ).rows,
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: "planRefused" } });
    const pid = usePortfolioStore.getState().portfolio!.properties[0].id;
    const r = await usePortfolioStore.getState().addValuation({
      id: "after-fail",
      propertyId: pid,
      validFrom: new Date(Date.UTC(2034, 0, 1)) as IsoDate,
      marketValue: money("1"),
    });
    expect(r.ok).toBe(true);
  });
});
