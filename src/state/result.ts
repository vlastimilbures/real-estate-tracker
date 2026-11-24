// What a store action returns (#467): it never throws; the caller branches on `ok`.

/** A success, with its `value` unless `T` is `void`, or a failure with its `error`. */
export type Result<T, E> =
  | ({ ok: true } & ([T] extends [void] ? unknown : { value: T }))
  | { ok: false; error: E };
