/** A new record id: a random UUID, the format every table's id column holds. The one
 *  place an id is made; callers choose when (a new one per record, or one kept for the
 *  life of a form). */
export function newId(): string {
  return crypto.randomUUID();
}
