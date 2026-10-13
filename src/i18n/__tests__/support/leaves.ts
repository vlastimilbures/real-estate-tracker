// Every leaf of a dictionary by its dotted key (shared by the dictionary tests).
export type Tree = { [k: string]: unknown };

export function leaves(t: Tree, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(t)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [kk, vv] of leaves(v as Tree, `${prefix}${k}.`))
        out.set(kk, vv);
    } else {
      out.set(`${prefix}${k}`, v);
    }
  }
  return out;
}
