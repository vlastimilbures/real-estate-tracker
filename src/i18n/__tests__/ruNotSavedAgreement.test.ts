// #564 review (F4), owner OK 2026-11-18: the Russian line that introduces the refused
// writes agrees with its plural subject, "эти изменения" (ADR 0255).
import { describe, it, expect } from "vitest";
import { ru } from "../ru";

describe("boot.notSaved in Russian", () => {
  it("uses the plural short form that agrees with «эти изменения»", () => {
    expect(ru.boot.notSaved.startsWith("Не сохранены — эти изменения")).toBe(
      true,
    );
  });
});
