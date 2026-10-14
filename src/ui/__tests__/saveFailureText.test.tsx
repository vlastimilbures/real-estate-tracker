// @vitest-environment jsdom
//
// ADR 0193 (#169, G2-5-07): a failed file save shows the OS text inside the translated
// sentence, without the English "Could not save the file:" wrapper.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveFileError } from "../../platform/saveFileTypes";
import { OutcomeRegions } from "../components/OutcomeRegions";
import { ExportXlsxButton } from "../components/primitives";
import { exportTableXlsx } from "../exportXlsx";
import { Import } from "../pages/Import";
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { portfolio, assumptions } from "../../engine/__tests__/support/seed";
import { loadDictionary } from "../../i18n";
import { cs } from "../../i18n/cs";

const OS = "No space left on device (os error 28)";
const diskFull = () => new SaveFileError(new Error(OS));

vi.mock("../../state/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/platform")>()),
  saveFile: vi.fn(() => Promise.reject(diskFull())),
}));
vi.mock("../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

beforeEach(async () => {
  await loadDictionary("cs");
  act(() => {
    useUiStore.setState({ language: "cs", route: "import", failure: null });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
    } as never);
  });
});

describe("a failed save in Czech (ADR 0193)", () => {
  it("the Excel export failure shows only the OS text", async () => {
    // Through the real button and export, so a wrapper added on the way fails here.
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
      .click(screen.getByRole("button", { name: cs.xlsx.exportToExcel }));
    expect(await screen.findByText(cs.xlsx.exportFailed(OS))).toBeTruthy();
  });

  it("the CSV template error shows only the OS text", async () => {
    render(<Import />);
    const [button] = screen.getAllByRole("button", {
      name: cs.importPage.downloadTemplate,
    });
    await userEvent.setup().click(button!);
    expect(
      await screen.findByText(cs.importPage.templateFailed(OS)),
    ).toBeTruthy();
  });
});
