// @vitest-environment jsdom
//
// The Import page's transitions as they are, pinned before its state moves into a reducer
// (ADR 0096, ADR 0240): when it previews, what a change drops, and what Import offers in
// each state. The other Import tests cover the rest: the replaced-file and stored-data
// resets (ImportPreview), success and failure (ImportDone), focus (ImportFocusAfterImport).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { propertiesTemplate } from "../../../import/csv";
import {
  CsvImportProblemsError,
  type CsvImportPreview,
  type ImportItem,
} from "../../../import/csvImport";
import { en } from "../../../i18n/en";
import { failure, success } from "../../../__tests__/support/result";

const p = en.importPage;

const add: ImportItem = {
  file: "properties",
  row: 2,
  kind: "add",
  propertyId: "byt-javorova",
  propertyName: "Byt Javorova",
  date: null,
  changes: [],
};
const update: ImportItem = {
  ...add,
  row: 3,
  kind: "update",
  propertyId: "byt-lipova",
  propertyName: "Byt Lipova",
  changes: [{ field: "address", before: "Lipova 5", after: "Lipova 7" }],
};
const unchanged: ImportItem = { ...add, kind: "unchanged" };

const plan = (items: ImportItem[]): CsvImportPreview => ({
  items,
  problems: [],
});
const refused: CsvImportPreview = {
  items: [],
  problems: [
    {
      file: "rents",
      row: 2,
      field: "property_name",
      problem: { code: "unknownProperty", value: "Nope" },
    },
  ],
};

const previewCsv = vi.fn();
const importCsv = vi.fn();

beforeEach(() => {
  previewCsv.mockReset();
  importCsv.mockReset();
  act(() => {
    usePortfolioStore.setState({ importCsv, previewCsv } as never);
  });
});

/** A promise the test settles: `settle(value)` resolves it. */
function later<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

async function choose(container: HTMLElement, content = propertiesTemplate()) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await userEvent.upload(
    input,
    new File([content], "properties.csv", { type: "text/csv" }),
  );
}

const importButton = () =>
  document.getElementById("import-run") as HTMLButtonElement;
const render = () => renderWithPortfolio(<Import />, { route: "import" });

describe("Import transitions (ADR 0096, ADR 0240)", () => {
  it("no file: no Import panel and no preview", () => {
    render();
    expect(
      screen.queryByRole("heading", { level: 2, name: p.importTitle }),
    ).toBeNull();
    expect(importButton()).toBeNull();
    expect(previewCsv).not.toHaveBeenCalled();
  });

  it("a file with errors: says so, previews nothing and disables Import", async () => {
    const { container } = render();
    await choose(container, "name;address\nA;B\n");
    expect(await screen.findByText(p.fixErrors)).toBeTruthy();
    expect(importButton().disabled).toBe(true);
    expect(importButton().textContent).toBe(p.importSelected);
    expect(previewCsv).not.toHaveBeenCalled();
  });

  it("a store change while a file has errors previews nothing", async () => {
    const { container } = render();
    await choose(container, "name;address\nA;B\n");
    await screen.findByText(p.fixErrors);
    act(() => usePortfolioStore.setState({ portfolio: { ...portfolio } }));
    expect(previewCsv).not.toHaveBeenCalled();
    expect(importButton().disabled).toBe(true);
  });

  it("while the preview runs: Import is disabled and names no scope", async () => {
    const next = later<CsvImportPreview>();
    previewCsv.mockReturnValueOnce(next.promise.then(success));
    const { container } = render();
    await choose(container);
    await waitFor(() => expect(previewCsv).toHaveBeenCalledTimes(1));
    expect(importButton().disabled).toBe(true);
    expect(importButton().textContent).toBe(p.importSelected);

    act(() => next.settle(plan([add])));
    await waitFor(() => expect(importButton().disabled).toBe(false));
    expect(importButton().textContent).toBe(p.importScope(1, 1, 0));
  });

  it("a preview that arrives after its file was replaced is never shown", async () => {
    const first = later<CsvImportPreview>();
    previewCsv.mockReturnValueOnce(first.promise.then(success));
    previewCsv.mockResolvedValueOnce(success(plan([add, update])));
    const { container } = render();
    await choose(container);
    await choose(container);
    await screen.findByRole("button", { name: p.importScope(2, 1, 1) });

    await act(async () => first.settle(plan([add])));
    expect(
      screen.queryByRole("button", { name: p.importScope(1, 1, 0) }),
    ).toBeNull();
    expect(importButton().textContent).toBe(p.importScope(2, 1, 1));
  });

  it("nothing to write: says so and disables Import", async () => {
    previewCsv.mockResolvedValue(success(plan([unchanged])));
    const { container } = render();
    await choose(container);
    expect(await screen.findByText(p.nothingToImport)).toBeTruthy();
    expect(importButton().disabled).toBe(true);
    expect(importButton().textContent).toBe(p.importSelected);
  });

  it("asking and cancelling the confirm does not preview again", async () => {
    previewCsv.mockResolvedValue(success(plan([update])));
    const { container } = render();
    await choose(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 0, 1) }),
    );
    expect(screen.getByText(p.confirmOverwriteMsg(1))).toBeTruthy();
    // The confirm row disables Import while it is open.
    expect(importButton().disabled).toBe(true);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(screen.queryByText(p.confirmOverwriteMsg(1))).toBeNull();
    expect(importButton().disabled).toBe(false);
    expect(previewCsv).toHaveBeenCalledTimes(1);
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("a replaced file closes the confirm row", async () => {
    previewCsv.mockResolvedValue(success(plan([update])));
    const { container } = render();
    await choose(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 0, 1) }),
    );
    expect(screen.getByText(p.confirmOverwriteMsg(1))).toBeTruthy();
    await choose(container);
    expect(screen.queryByText(p.confirmOverwriteMsg(1))).toBeNull();
    await waitFor(() => expect(previewCsv).toHaveBeenCalledTimes(2));
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("while importing: Import and the confirm buttons are disabled", async () => {
    previewCsv.mockResolvedValue(success(plan([update])));
    const run = later<unknown>();
    importCsv.mockReturnValueOnce(run.promise);
    const { container } = render();
    await choose(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 0, 1) }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: p.confirmOverwrite(1) }),
    );
    expect(importCsv).toHaveBeenCalledTimes(1);
    expect(importButton().disabled).toBe(true);
    expect(importButton().textContent).toBe(p.importing);
    expect(screen.queryByText(p.confirmOverwriteMsg(1))).toBeNull();

    await act(async () => run.settle(failure(new Error("database is locked"))));
    expect(importButton().textContent).toBe(p.importScope(1, 0, 1));
  });

  it("a failed import keeps the files and the preview, and does not preview again", async () => {
    previewCsv.mockResolvedValue(success(plan([add])));
    importCsv.mockResolvedValueOnce(failure(new Error("database is locked")));
    const { container } = render();
    await choose(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    await waitFor(() => expect(importCsv).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(importButton().disabled).toBe(false));
    expect(importButton().textContent).toBe(p.importScope(1, 1, 0));
    expect(
      screen.getByText("properties.csv", { selector: "span.num" }),
    ).toBeTruthy();
    expect(previewCsv).toHaveBeenCalledTimes(1);
  });

  it("a plan refused at the click stays until the file changes, which previews again", async () => {
    previewCsv.mockResolvedValue(success(plan([add])));
    importCsv.mockResolvedValueOnce(
      failure(new CsvImportProblemsError(refused)),
    );
    const { container } = render();
    await choose(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    expect(await screen.findByText(p.errUnknownProperty("Nope"))).toBeTruthy();
    expect(previewCsv).toHaveBeenCalledTimes(1);

    await choose(container);
    expect(screen.queryByText(p.errUnknownProperty("Nope"))).toBeNull();
    expect(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    ).toBeTruthy();
    expect(previewCsv).toHaveBeenCalledTimes(2);
  });

  it("a plan refused at the click goes on a store change, which previews again", async () => {
    previewCsv.mockResolvedValue(success(plan([add])));
    importCsv.mockResolvedValueOnce(
      failure(new CsvImportProblemsError(refused)),
    );
    const { container } = render();
    await choose(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    await screen.findByText(p.errUnknownProperty("Nope"));

    act(() => usePortfolioStore.setState({ portfolio: { ...portfolio } }));
    expect(screen.queryByText(p.errUnknownProperty("Nope"))).toBeNull();
    expect(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    ).toBeTruthy();
    expect(previewCsv).toHaveBeenCalledTimes(2);
  });

  it("a failed preview goes on a store change, which previews again", async () => {
    previewCsv.mockResolvedValueOnce(failure(new Error("database is locked")));
    previewCsv.mockResolvedValueOnce(success(plan([add])));
    const { container } = render();
    await choose(container);
    await waitFor(() => expect(previewCsv).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/could not be checked/)).toBeTruthy();
    expect(importButton().disabled).toBe(true);

    act(() => usePortfolioStore.setState({ portfolio: { ...portfolio } }));
    expect(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    ).toBeTruthy();
    expect(screen.queryByText(/could not be checked/)).toBeNull();
    expect(previewCsv).toHaveBeenCalledTimes(2);
  });
});
