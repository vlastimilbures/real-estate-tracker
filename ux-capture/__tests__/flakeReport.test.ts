// The capture run's flake report (#496): which screens are regressions, which are flaky,
// and how they are announced.
import { describe, expect, it } from "vitest";
import {
  annotations,
  classify,
  toMarkdown,
  type Entry,
} from "../flakeReport.ts";

const entry = (over: Partial<Entry>): Entry => ({
  project: "en-light-1280x800",
  title: "01-dashboard — Dashboard, nominal, as of today",
  outcome: "expected",
  errors: [],
  ...over,
});

describe("classify", () => {
  it("counts a screen that failed every attempt as a regression", () => {
    const c = classify([
      entry({
        outcome: "unexpected",
        errors: ["Error: expect(received).toBe(expected)\n\nExpected: 1", "x"],
      }),
    ]);
    expect(c).toEqual({
      regressions: [
        {
          project: "en-light-1280x800",
          id: "01-dashboard",
          error: "Error: expect(received).toBe(expected)",
        },
      ],
      flaky: [],
    });
  });

  it("counts a screen that failed and then passed as flaky, with its first error", () => {
    const c = classify([
      entry({
        project: "en-light-min",
        title:
          "26-property-amortization-open — Property detail with the schedule",
        outcome: "flaky",
        errors: ["\u001b[31m\n  Error: screenshot differs\u001b[39m\nmore"],
      }),
    ]);
    expect(c.regressions).toEqual([]);
    expect(c.flaky).toEqual([
      {
        project: "en-light-min",
        id: "26-property-amortization-open",
        error: "Error: screenshot differs",
      },
    ]);
  });

  it("leaves passed and skipped screens out", () => {
    const c = classify([
      entry({}),
      entry({ outcome: "skipped" }),
      entry({ title: "manifest covers every route" }),
    ]);
    expect(c).toEqual({ regressions: [], flaky: [] });
  });

  it("names a failure without a message", () => {
    const c = classify([entry({ outcome: "flaky", errors: [""] })]);
    expect(c.flaky[0]!.error).toBe("(no error message)");
  });
});

describe("annotations", () => {
  it("warns once per flake and escapes the message", () => {
    const c = classify([
      entry({ outcome: "flaky", errors: ["Error: 100% off"] }),
      entry({ outcome: "unexpected", errors: ["Error: broken"] }),
    ]);
    expect(annotations(c)).toEqual([
      "::warning title=Flaky capture::en-light-1280x800 01-dashboard: Error: 100%25 off",
    ]);
  });
});

describe("toMarkdown", () => {
  it("says so when nothing failed", () => {
    expect(toMarkdown({ regressions: [], flaky: [] }, "ci")).toBe(
      "### UX capture `ci`\n\nNo regressions, no flaky captures.\n",
    );
  });

  it("lists regressions and flakes in separate tables, pipes escaped", () => {
    const md = toMarkdown(
      classify([
        entry({ outcome: "unexpected", errors: ["Error: a | b"] }),
        entry({
          project: "en-dark-min",
          title: "29-property-prepayment-outputs — After saving events",
          outcome: "flaky",
          errors: ["Error: tooltip"],
        }),
      ]),
      "ci-i18n",
    );
    expect(md).toBe(
      [
        "### UX capture `ci-i18n`",
        "",
        "**Regressions: failed every attempt (1)**",
        "",
        "| Project | Screen | First error |",
        "| --- | --- | --- |",
        "| en-light-1280x800 | 01-dashboard | Error: a \\| b |",
        "",
        "**Flaky: failed, then passed on a retry (1)**",
        "",
        "| Project | Screen | First error |",
        "| --- | --- | --- |",
        "| en-dark-min | 29-property-prepayment-outputs | Error: tooltip |",
        "",
      ].join("\n"),
    );
  });
});
