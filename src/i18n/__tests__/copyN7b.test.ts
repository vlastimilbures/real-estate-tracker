// Track 14 N7b copy (ADR 0187, docs/decisions/wording.md 2026-10-13): the owner-approved
// text of each changed key, per language.
import { describe, it, expect } from "vitest";
import { en } from "../en";
import { cs } from "../cs";
import { ru } from "../ru";

describe("N7b wording (#169, #152)", () => {
  it.each([
    ["cs", cs, 1, "1 scénář"],
    ["cs", cs, 3, "3 scénáře"],
    ["cs", cs, 5, "5 scénářů"],
    ["ru", ru, 1, "1 сценарий"],
    ["ru", ru, 3, "3 сценария"],
    ["ru", ru, 5, "5 сценариев"],
  ])("%s: the compare-full toasts decline %i", (_, d, max, words) => {
    expect(d.scenarios.addedCompareFull("A", max)).toContain(words);
    expect(d.scenarios.duplicatedCompareFull("A", max)).toContain(words);
  });

  it.each([
    [1, "až 1 scénář"],
    [3, "až 3 scénáře"],
    [5, "až 5 scénářů"],
  ])("cs: the list hint declines %i", (max, words) => {
    expect(cs.scenarios.listHint(max)).toContain(words);
  });

  it("en and ru: the count word follows the number", () => {
    expect(en.scenarios.addedCompareFull("A", 1)).toContain("1 scenario,");
    expect(en.scenarios.listHint(3)).toContain("up to 3 scenarios");
    expect(ru.scenarios.listHint(1)).toContain("до 1 сценария");
    expect(ru.scenarios.listHint(3)).toContain("до 3 сценариев");
  });
});
