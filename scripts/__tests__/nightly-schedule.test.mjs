// nightly.yml's two schedules (ADR 0249): the weekly cron string also appears in the
// `changed` step and in the property job's `if:`, which compare it with
// github.event.schedule. A copy that drifts would skip mutation or run the property job
// twice, so all three must match. Read only, with the workflow reader of gates.mjs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { yamlTree } from "../gates.mjs";

const nightly = yamlTree(
  readFileSync(
    new URL("../../.github/workflows/nightly.yml", import.meta.url),
    "utf8",
  ),
);
const crons = nightly.on.schedule.map((s) => s.cron);
const [daily, weekly] = crons;

describe("nightly.yml schedules (ADR 0249)", () => {
  it("has a daily and a weekly cron, in minutes of their own", () => {
    expect(crons).toHaveLength(2);
    expect(daily).toMatch(/^\d+ \d+ \* \* \*$/);
    expect(weekly).toMatch(/^\d+ \d+ \* \* \d$/);
    expect(weekly.split(" ").slice(0, 2)).not.toEqual(
      daily.split(" ").slice(0, 2),
    );
  });

  it("names the weekly cron in the changed step", () => {
    const step = nightly.jobs.changed.steps.find((s) => s.id === "check");
    expect(step.run).toContain(`[[ "$SCHEDULE" == "${weekly}" ]]`);
  });

  it("names the weekly cron in the property job's if", () => {
    expect(nightly.jobs.properties.if).toBe(
      `github.event.schedule != '${weekly}'`,
    );
  });
});
