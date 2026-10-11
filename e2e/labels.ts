// Labels come from the English dictionary, as in ux-capture, so a wording change does not
// break a spec (#141).
import { en } from "../src/i18n/en";

export { en };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The export toast for a file name matching `name` (a regex source). */
export function exportedToast(name: string): RegExp {
  const [before = "", after = ""] = en.xlsx.exported("\0").split("\0");
  return new RegExp(`${escape(before)}${name}${escape(after)}`);
}
