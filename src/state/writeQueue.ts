// The store's one queue (DR-085): each job starts only after the previous one settled,
// so writes reach the DB in call order and a refresh never interleaves with another
// write. The CSV preview and Try again after a failed read-back wait in it too
// (ADR 0132, ADR 0228).

interface WriteQueue {
  /** Run `job` after everything queued before it has settled. A failed job never blocks
   *  the ones after it. */
  enqueue<T>(job: () => Promise<T>): Promise<T>;
}

export function createWriteQueue(): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue(job) {
      const run = tail.then(job);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
