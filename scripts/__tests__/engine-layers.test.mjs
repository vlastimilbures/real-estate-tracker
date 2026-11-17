// scripts/engine-layers.cjs (#499): the one list of what the engine may not import, as
// dependency-cruiser's rule and as ESLint's engine import hint, and both configs using it.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import config from "../../eslint.config.js";
import { depcruiseTo, eslintGroup } from "../engine-layers.cjs";

const require = createRequire(import.meta.url);
const depcruise = require("../../.dependency-cruiser.cjs");

describe("engine layers", () => {
  it("give dependency-cruiser the app layers and lib, except money and rules", () => {
    expect(depcruiseTo()).toEqual({
      path: "^src/(data|state|ui|import|i18n)/|^src/lib/",
      pathNot: "^src/lib/(money|rules)\\.ts$",
    });
    const { path, pathNot } = depcruiseTo();
    const banned = (file) =>
      new RegExp(path).test(file) && !new RegExp(pathNot).test(file);
    for (const file of [
      "src/data/sql.ts",
      "src/state/uiStore.ts",
      "src/ui/App.tsx",
      "src/import/csv.ts",
      "src/i18n/index.ts",
      "src/lib/day.ts",
    ]) {
      expect(banned(file), file).toBe(true);
    }
    for (const file of [
      "src/lib/money.ts",
      "src/lib/rules.ts",
      "src/engine/dates.ts",
      "src/platform/saveFile.ts",
    ]) {
      expect(banned(file), file).toBe(false);
    }
  });

  it("give ESLint each layer bare and with a subpath, lib but money and rules, and the packages", () => {
    expect(eslintGroup()).toEqual([
      "**/data",
      "**/data/**",
      "**/state",
      "**/state/**",
      "**/ui",
      "**/ui/**",
      "**/import",
      "**/import/**",
      "**/i18n",
      "**/i18n/**",
      "**/lib/**",
      "!**/lib/money",
      "!**/lib/rules",
      "react",
      "react-dom",
      "@tauri-apps/*",
    ]);
  });

  it("are what .dependency-cruiser.cjs uses", () => {
    const rule = depcruise.forbidden.find(
      (r) => r.name === "engine-pure-layers",
    );
    expect(rule.to).toEqual(depcruiseTo());
  });

  it("are what eslint.config.js uses for the engine and its reference folder", () => {
    const groups = config
      .filter((c) => c.files?.some((f) => f.startsWith("src/engine/")))
      .flatMap((c) => c.rules?.["no-restricted-imports"]?.[1]?.patterns ?? [])
      .filter((p) => p.group);
    expect(groups).toHaveLength(2);
    for (const p of groups) expect(p.group).toEqual(eslintGroup());
  });
});
