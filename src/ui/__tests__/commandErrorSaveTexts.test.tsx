// @vitest-environment jsdom
//
// ADR 0271: a file save that Rust refused with one of the fixed file-write codes shows the
// code's text in the user's language inside the Excel export and CSV template messages,
// never Rust's English sentence or a path.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandError } from "../../platform/commandError";
import { SaveFileError } from "../../platform/saveFileTypes";
import { OutcomeRegions } from "../components/OutcomeRegions";
import { ExportXlsxButton } from "../components/ExportXlsxButton";
import { exportTableXlsx } from "../exportXlsx";
import { Import } from "../pages/Import";
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { loadDictionary, type Dictionary } from "../../i18n";

const rejection = vi.hoisted(() => ({ next: null as unknown }));
vi.mock("../../state/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/platform")>()),
  saveFile: vi.fn(() => Promise.reject(rejection.next)),
}));
vi.mock("../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

/** The three fixed file-write codes and Rust's text for each (src-tauri/src/error.rs). */
const FILE_WRITE = [
  ["SAVED_FILE_MISMATCH", "the saved file does not match"],
  ["NO_FOLDER", "no folder for /Users/me/t.xlsx"],
  ["NO_FILE_NAME", "no file name in /Users/me/.."],
] as const;

describe.each(["cs", "ru"] as const)(
  "a refused file save in %s (ADR 0271)",
  (lang) => {
    let t: Dictionary;
    beforeEach(async () => {
      t = await loadDictionary(lang);
      act(() => {
        useUiStore.setState({ language: lang, route: "import" });
        usePortfolioStore.setState({
          portfolio,
          assumptions,
          status: { kind: "ready" },
        } as never);
      });
    });

    it.each(FILE_WRITE)(
      "the Excel export failure with %s shows its text",
      async (code, detail) => {
        rejection.next = new SaveFileError(new CommandError(code, detail));
        render(
          <>
            <ExportXlsxButton
              onExport={() =>
                exportTableXlsx({
                  filename: "t.xlsx",
                  sheetName: "T",
                  columns: () => [],
                  rows: [],
                })
              }
            />
            <OutcomeRegions />
          </>,
        );
        await userEvent
          .setup()
          .click(screen.getByRole("button", { name: t.xlsx.exportToExcel }));
        expect(
          await screen.findByText(t.xlsx.exportFailed(t.commandErrors[code])),
        ).toBeTruthy();
        act(() => useUiStore.getState().dismissFailure());
      },
    );

    it.each(FILE_WRITE)(
      "the CSV template error with %s shows its text",
      async (code, detail) => {
        rejection.next = new SaveFileError(new CommandError(code, detail));
        render(<Import />);
        const button = screen.getByRole("button", {
          name: t.importPage.templateFor(t.importPage.propertiesTitle),
        });
        await userEvent.setup().click(button);
        expect(
          await screen.findByText(
            t.importPage.templateFailed(t.commandErrors[code]),
          ),
        ).toBeTruthy();
      },
    );
  },
);
