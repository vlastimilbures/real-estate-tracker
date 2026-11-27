// The order capture.spec.ts declares the screens in, so the six CI shards take about the
// same time. With `fullyParallel`, `--shard k/N` gives each shard an equal count of
// consecutive tests, projects one after another. The English run has 4 projects and 6
// shards, so each shard is 2/3 of a project and the cuts fall at its thirds. In flow
// order a third is one area, and the slow areas (property detail, financing) made one
// shard 50 s slower than another. Every third screen per pass spreads each area over
// all thirds. The Czech and Russian run has one project per shard: its order is moot.

/** Every `stride`-th item, from offset 0, then 1, …: each item once. */
export function interleave<T>(items: readonly T[], stride = 3): T[] {
  const out: T[] = [];
  for (let start = 0; start < stride; start++)
    for (let i = start; i < items.length; i += stride) out.push(items[i]);
  return out;
}
