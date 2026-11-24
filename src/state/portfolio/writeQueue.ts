// The store's one queue (DR-085): each job starts only after the previous one settled,
// so writes reach the DB in call order and a refresh never interleaves with another
// write. The CSV preview and Try again after a failed read-back wait in it too
// (ADR 0132, ADR 0228).

interface WriteQueue {
  /** Run `job` after everything queued before it has settled. A failed job never blocks
   *  the ones after it. */
  enqueue<T>(job: () => Promise<T>): Promise<T>;
  /** `enqueue` for a write: counted from the call, while it waits too, until it settles
   *  (ADR 0253). The count falls before the caller's `await` resumes. */
  write<T>(job: () => Promise<T>): Promise<T>;
}

/** `onCount` gets the number of writes queued or running each time it changes. */
export function createWriteQueue(
  onCount: (running: number) => void,
): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let running = 0;
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = tail.then(job);
    tail = run.catch(() => undefined);
    return run;
  }
  return {
    enqueue,
    write(job) {
      onCount((running += 1));
      return enqueue(job).finally(() => onCount((running -= 1)));
    },
  };
}
