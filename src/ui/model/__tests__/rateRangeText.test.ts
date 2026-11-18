// #441 item 1: the range message under a percent field (mortgage rate, vacancy, costs as
// a share of rent, selling cost, reset rate) speaks in percent, as the field does.
import { describe, it, expect } from "vitest";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";

describe("RATE_OUT_OF_RANGE speaks in percent (#441 item 1)", () => {
  it("reads 0 to 100 % in every language, with no fraction wording", () => {
    expect(en.inputRules.RATE_OUT_OF_RANGE).toBe("Must be from 0 to 100 %");
    expect(cs.inputRules.RATE_OUT_OF_RANGE).toBe("Musí být od 0 do 100 %");
    expect(ru.inputRules.RATE_OUT_OF_RANGE).toBe("Должно быть от 0 до 100 %");
  });
});
