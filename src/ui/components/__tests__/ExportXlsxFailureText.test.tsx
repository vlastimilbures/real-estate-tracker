// @vitest-environment jsdom
//
// ADR 0193: a failed Excel export says what failed. A failed save gives the OS text only;
// any other failure gives its own message, also one the store would type as a
// constraint or data error (#467 review L1: the typed kinds gave "").
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutcomeRegions } from "../OutcomeRegions";
import { ExportXlsxButton } from "../primitives";
import { SaveFileError } from "../../../platform/saveFileTypes";
import { en } from "../../../i18n/en";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

async function exportFails(e: unknown) {
  render(
    <>
      <ExportXlsxButton onExport={() => Promise.reject(e)} />
      <OutcomeRegions />
    </>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: en.xlsx.exportToExcel }),
  );
}

describe("a failed Excel export's text (ADR 0193)", () => {
  it("a failed save gives the OS text", async () => {
    await exportFails(new SaveFileError(new Error("disk full")));
    expect(screen.getByText(en.xlsx.exportFailed("disk full"))).toBeTruthy();
  });

  it("any other error gives its own message", async () => {
    const message = "UNIQUE constraint failed: properties.name";
    await exportFails(new Error(message));
    expect(screen.getByText(en.xlsx.exportFailed(message))).toBeTruthy();
  });
});
