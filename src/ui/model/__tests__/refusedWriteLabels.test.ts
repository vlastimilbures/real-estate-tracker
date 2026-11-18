// ADR 0255 (#446): each refused write is named by an existing dictionary entry.
import { describe, expect, it } from "vitest";
import { refusedWriteLabels } from "../bootFailure";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";

describe("refusedWriteLabels (ADR 0255)", () => {
  it.each([
    ["properties", en.backup.tables.properties],
    ["mortgage_blocks", en.backup.tables.mortgage_blocks],
    ["valuations", en.backup.tables.valuations],
    ["leases", en.backup.tables.leases],
    ["holding_costs", en.backup.tables.holding_costs],
    ["assumptions", en.backup.tables.assumptions],
    ["scenarios", en.backup.tables.scenarios],
    ["importCsv", en.common.importCsv],
    ["restore", en.backup.restoreTitle],
    ["clearSample", en.sample.confirm],
    ["loadSample", en.sample.loadAction],
  ] as const)("names %s", (target, label) => {
    expect(refusedWriteLabels(en, [target])).toEqual([label]);
  });

  it("keeps the order it is given", () => {
    expect(refusedWriteLabels(en, ["leases", "restore", "valuations"])).toEqual(
      [
        en.backup.tables.leases,
        en.backup.restoreTitle,
        en.backup.tables.valuations,
      ],
    );
  });

  it("names nothing for an empty list", () => {
    expect(refusedWriteLabels(en, [])).toEqual([]);
  });

  it.each([
    ["cs", cs],
    ["ru", ru],
  ] as const)("follows the language (%s)", (_, t) => {
    expect(refusedWriteLabels(t, ["leases", "loadSample"])).toEqual([
      t.backup.tables.leases,
      t.sample.loadAction,
    ]);
  });
});
