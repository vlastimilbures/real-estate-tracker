// A failed app command where a message shows its detail (ADR 0271): the translated text
// for its Rust code, else the detail as it came (ADR 0270). Picked by the code only; the
// detail is never read (ADR 0270, "No string matching").
import type { CommandErrorCode } from "../../platform/commandError";
import type { Dictionary } from "../../i18n";

type Texts = Dictionary["commandErrors"];
/** The codes with a fixed text; `BACKUP_EXISTS` names its file. */
type FixedCode = Exclude<keyof Texts, "BACKUP_EXISTS">;

/** A failed command as the state layer hands it on: its code (null when the failure was
 *  not a command), Rust's detail, and the file name the webview chose, if any. */
export interface CommandFailure {
  code: CommandErrorCode | null;
  detail: string;
  file?: string | null;
}

function isFixed(texts: Texts, code: CommandErrorCode): code is FixedCode {
  return code !== "BACKUP_EXISTS" && Object.hasOwn(texts, code);
}

/** The translated text for `code`; null for a code without one, and for `BACKUP_EXISTS`
 *  without the file name. */
export function commandErrorText(
  t: Pick<Dictionary, "commandErrors">,
  code: CommandErrorCode | null,
  file?: string | null,
): string | null {
  const texts = t.commandErrors;
  if (code === "BACKUP_EXISTS") return file ? texts.BACKUP_EXISTS(file) : null;
  return code !== null && isFixed(texts, code) ? texts[code] : null;
}

/** The text for a failed command inside a message: translated by its code, else Rust's
 *  detail. */
export function commandFailureText(
  t: Pick<Dictionary, "commandErrors">,
  { code, detail, file }: CommandFailure,
): string {
  return commandErrorText(t, code, file) ?? detail;
}
