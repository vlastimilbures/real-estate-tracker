// #529 (owner, #435 comment 6965976270): the projection years' month range ("Jul – Jun")
// does not wrap at the spaces around its en dash. The spaces are U+00A0, the no-break
// space `src/lib/format.ts` already uses (docs/decisions/wording.md, 2026-11-18).
import { describe, it, expect } from "vitest";
import { isoDate } from "../../../engine";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { yearSpanNote } from "../tableContext";

const base = isoDate("2026-06-07");
const NBSP = " ";

describe("yearSpanNote's month range (#529)", () => {
  it.each([
    ["en", en],
    ["cs", cs],
    ["ru", ru],
  ] as const)("keeps the range on one line in %s", (_lang, t) => {
    const from = t.monthsShort[6] ?? "";
    const to = t.monthsShort[5] ?? "";
    const note = yearSpanNote(t, base) ?? "";
    expect(note).toContain(`${from}${NBSP}–${NBSP}${to}`);
    expect(note).not.toContain(`${from} – ${to}`);
  });
});
