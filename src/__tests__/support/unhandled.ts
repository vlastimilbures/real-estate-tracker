// The rejections a fire-and-forget call leaves without a handler. Node reports one as
// `unhandledRejection` once the microtasks after it have run, so the check waits a
// macrotask.

/** Run `fire` and collect what was rejected without a handler on the way. */
export async function unhandledRejections(
  fire: () => void,
): Promise<unknown[]> {
  const seen: unknown[] = [];
  const listen = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", listen);
  try {
    fire();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", listen);
  }
  return seen;
}
