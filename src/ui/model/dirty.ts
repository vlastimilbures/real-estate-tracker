// Unsaved-input check for form drafts (UX-029): a draft is dirty when any field differs
// from the values the form opened with. Drafts are flat records of strings/booleans/null.

export function isDirty<T extends object>(initial: T, current: T): boolean {
  const a = initial as Record<string, unknown>;
  const b = current as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!Object.is(a[k], b[k])) return true;
  return false;
}
