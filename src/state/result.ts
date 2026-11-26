// What a store action returns: it never throws; the caller branches on `ok`.

/** A success, with its `value` unless `T` is `void`, or a failure with its `error`. */
export type Result<T, E> =
  | ({ ok: true } & ([T] extends [void] ? unknown : { value: T }))
  | { ok: false; error: E };

/** A success carrying `value`; for `void`, the value is `undefined`. */
export function success<T>(value: T): Result<T, never> {
  return { ok: true, value } as Result<T, never>;
}
