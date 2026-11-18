// ADR 0250 (#441 item 3): the CSV preview shows the garage flag as the dictionary's
// yes / no in the UI language, not English "true" / "false".
import { describe, it, expect } from "vitest";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { changeText } from "../importPreview";

describe("changeText: the garage flag (ADR 0250)", () => {
  it("reads yes / no in every language", () => {
    const change = { field: "garage", before: "0", after: "1" };
    expect(changeText(en, change)).toBe("No → Yes");
    expect(changeText(cs, change)).toBe("Ne → Ano");
    expect(changeText(ru, change)).toBe("Нет → Да");
    expect(changeText(cs, { field: "garage", before: null, after: "0" })).toBe(
      "— → Ne",
    );
  });
});
