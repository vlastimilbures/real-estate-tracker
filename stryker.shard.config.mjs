// One shard of the nightly Stryker run (ADR 0239, #443): stryker.config.json with `mutate`
// from the shard table in scripts/mutation-shards.mjs, its own incremental file, and no
// break threshold: the mutation-score job gates the combined score of all shards instead.
// Run one locally: `STRYKER_SHARD=<name> pnpm mutation:shard`.
import { readFileSync } from "node:fs";
import { SHARDS, mutateFor } from "./scripts/mutation-shards.mjs";

const base = JSON.parse(
  readFileSync(new URL("./stryker.config.json", import.meta.url), "utf8"),
);
const shard = process.env.STRYKER_SHARD;
if (!shard)
  throw new Error(
    `STRYKER_SHARD is not set; expected one of ${Object.keys(SHARDS).join(", ")}`,
  );

export default {
  ...base,
  mutate: mutateFor(shard),
  incrementalFile: `reports/mutation/stryker-incremental-${shard}.json`,
  thresholds: { ...base.thresholds, break: null },
};
