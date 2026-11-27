// ADR 0271: where a message shows a failed command's detail, the text is picked by the
// command's code; any other failure shows its detail as it came.
import { describe, expect, it } from "vitest";
import { en } from "../../../i18n/en";
import { commandErrorText, commandFailureText } from "../commandErrorText";

const FIXED = [
  "BACKUP_PATH_NOT_UTF8",
  "BACKUP_FAILED",
  "BACKUP_UNREADABLE",
  "BACKUP_CORRUPT",
  "BACKUP_MISMATCH",
  "SAVED_FILE_MISMATCH",
  "NO_FOLDER",
  "NO_FILE_NAME",
] as const;

describe("commandFailureText (ADR 0271)", () => {
  it.each(FIXED)("%s gives its translated text, not Rust's", (code) => {
    expect(
      commandFailureText(en, { code, detail: `${code}: library text` }),
    ).toBe(en.commandErrors[code]);
  });

  it("BACKUP_EXISTS names the file the webview chose", () => {
    expect(
      commandFailureText(en, {
        code: "BACKUP_EXISTS",
        detail: "BACKUP_EXISTS: /Users/me/backups/x.json",
        file: "x.json",
      }),
    ).toBe(en.commandErrors.BACKUP_EXISTS("x.json"));
  });

  it("BACKUP_EXISTS without a file name keeps the detail", () => {
    const detail = "BACKUP_EXISTS: /b/x.json";
    expect(
      commandFailureText(en, { code: "BACKUP_EXISTS", detail, file: null }),
    ).toBe(detail);
  });

  it.each(["IO", "SQL", "OTHER", "BACKUP_TOO_LARGE"] as const)(
    "%s, which has no text of its own, keeps the detail",
    (code) => {
      const detail = "No space left on device (os error 28)";
      expect(commandFailureText(en, { code, detail })).toBe(detail);
    },
  );

  it("a failure that was not a command keeps the detail", () => {
    expect(commandFailureText(en, { code: null, detail: "no workbook" })).toBe(
      "no workbook",
    );
  });
});

describe("commandErrorText (ADR 0271)", () => {
  it("is null for a code without a text and for no code", () => {
    expect(commandErrorText(en, "IO")).toBeNull();
    expect(commandErrorText(en, null)).toBeNull();
  });
});
