// One shard of the nightly Stryker run (ADR 0239, #443): stryker.config.json with `mutate`
// from the shard table in scripts/mutation-shards.mjs, its own incremental file, and no
// break threshold: the mutation-score job gates the combined score of all shards instead.
// Run one locally: `STRYKER_SHARD=<name> pnpm mutation:shard`.
import { readFileSync } from "node:fs";
import { SHARDS, mutateFor } from "./scripts/mutation-shards.mjs";

const base = JSON.parse(
  readFileSync(new URL("./stryker.config.json", import.meta.url), "utf8"),
);

/** The shard to run; throws when STRYKER_SHARD is unset (mutateFor throws on an unknown one). */
const shard = () => {
  const s = process.env.STRYKER_SHARD;
  if (!s)
    throw new Error(
      `STRYKER_SHARD is not set; expected one of ${Object.keys(SHARDS).join(", ")}`,
    );
  return s;
};

// Getters, so that loading this file without STRYKER_SHARD works (knip's Stryker plugin
// reads it for the plugins it names) and Stryker still fails when it reads `mutate`.
export default {
  ...base,
  get mutate() {
    return mutateFor(shard());
  },
  get incrementalFile() {
    return `reports/mutation/stryker-incremental-${shard()}.json`;
  },
  thresholds: { ...base.thresholds, break: null },
};
