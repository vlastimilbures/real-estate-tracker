// @vitest-environment jsdom
//
// ADR 0248 §2 (#549): the Excel export button disables while it writes, which drops focus
// to <body>. Once the export ends, saved, cancelled or refused, focus goes back to the
// button, unless the user moved it.
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportXlsxButton } from "../primitives";
import type { SaveOutcome } from "../../../platform/saveFileTypes";
import { deferred, type Deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

const button = () =>
  screen.getByRole("button", { name: en.xlsx.exportToExcel });

async function startExport(): Promise<Deferred<SaveOutcome>> {
  const write = deferred<SaveOutcome>();
  render(
    <>
      <ExportXlsxButton onExport={() => write.promise} />
      <button type="button">Elsewhere</button>
    </>,
  );
  await userEvent.click(button());
  expect(button()).toHaveProperty("disabled", true);
  return write;
}

const outcomes: [string, (w: Deferred<SaveOutcome>) => void][] = [
  ["saved", (w) => w.resolve({ kind: "saved", filename: "table.xlsx" })],
  ["cancelled", (w) => w.resolve({ kind: "cancelled" })],
  ["refused", (w) => w.reject(new Error("disk full"))],
];

describe("Excel export focus after any outcome (ADR 0248 §2)", () => {
  for (const [outcome, settle] of outcomes)
    it(`puts focus back on the button when the export is ${outcome} (#549)`, async () => {
      const write = await startExport();
      // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
      act(() => button().blur());
      expect(document.activeElement).toBe(document.body);
      await act(async () => settle(write));
      expect(button()).toHaveProperty("disabled", false);
      expect(document.activeElement).toBe(button());
    });

  it("leaves focus where the user moved it during the export", async () => {
    const write = await startExport();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => write.resolve({ kind: "cancelled" }));
    expect(button()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(elsewhere);
  });
});
