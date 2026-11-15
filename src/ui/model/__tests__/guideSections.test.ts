// ADR 0213 (#390): the Guide's sections, in page order, labelled with their titles.
import { describe, it, expect } from "vitest";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { guideSections } from "../guideSections";

describe("guideSections (ADR 0213 §1)", () => {
  it("lists the ten sections in page order, each with its own title", () => {
    const g = en.guide;
    expect(guideSections(en).map((s) => s.label)).toEqual([
      g.howItWorksTitle,
      g.snapshotTitle,
      g.mortgagesTitle,
      g.projectionTitle,
      g.nominalRealTitle,
      g.returnsTitle,
      g.scenariosTitle,
      g.developmentTitle,
      g.glossaryTitle,
      g.limitsTitle,
    ]);
  });

  it("gives each a distinct element id that does not change with the language", () => {
    const ids = guideSections(en).map((s) => s.id);
    expect(new Set(ids).size).toBe(10);
    expect(ids.every((id) => id.startsWith("guide-"))).toBe(true);
    expect(guideSections(cs).map((s) => s.id)).toEqual(ids);
    expect(guideSections(cs)[0]!.label).toBe(cs.guide.howItWorksTitle);
  });
});
