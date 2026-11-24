// @vitest-environment jsdom
//
// ADR 0248 §2–§3 (#549): Import disables itself while it runs, and its overwrite confirm
// leaves the page when the import starts, so focus falls to <body>. After a failure it
// goes to Import; after a success, which clears the files and the Import panel, to the
// report heading; after a plan refused at the click, which disables Import, to the
// Import panel heading. Focus the user moved stays where it is.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { propertiesTemplate } from "../../../import/csv";
import {
  CsvImportProblemsError,
  type CsvImportPreview,
  type CsvImportReport,
  type ImportItem,
} from "../../../import/csvImport";
import { deferred, type Deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";
import { failure, success } from "../../../__tests__/support/result";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

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
const refused = new CsvImportProblemsError({
  items: [],
  problems: [
    {
      file: "rents",
      row: 2,
      field: "property_name",
      problem: { code: "unknownProperty", value: "Nope" },
    },
  ],
});

let run: Deferred<CsvImportReport>;
let items: ImportItem[];

beforeEach(() => {
  run = deferred();
  items = [add];
  act(() => {
    usePortfolioStore.setState({
      importCsv: () => run.promise.then(success, failure),
      previewCsv: async () =>
        success<CsvImportPreview>({
          items,
          problems: [],
        }),
    } as never);
  });
});

/** Import under any of its labels: the scope, Importing… or the label with no plan. */
const importLabels = [
  p.importScope(1, 1, 0),
  p.importScope(2, 1, 1),
  p.importing,
  p.importSelected,
];
const importButton = () =>
  screen.getByRole("button", {
    name: (name) => importLabels.includes(name),
  });
const heading = (name: string) =>
  screen.getByRole("heading", { level: 2, name });

/** Choose a properties file and press Import (and the overwrite confirm, with `update`). */
async function startImport(withUpdate = false) {
  if (withUpdate) items = [add, update];
  const { container } = renderWithPortfolio(
    <>
      <Import />
      <button type="button">Elsewhere</button>
    </>,
    { route: "import" },
  );
  await userEvent.upload(
    container.querySelector('input[type="file"]') as HTMLInputElement,
    new File([propertiesTemplate()], "properties.csv", { type: "text/csv" }),
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: withUpdate ? p.importScope(2, 1, 1) : p.importScope(1, 1, 0),
    }),
  );
  if (withUpdate)
    await userEvent.click(
      screen.getByRole("button", { name: p.confirmOverwrite(1) }),
    );
  expect(importButton()).toHaveProperty("disabled", true);
  // The focus fixup for the disabled button (or the confirm that left), fired now.
  act(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(document.activeElement).toBe(document.body);
}

describe("Import: focus after the outcome (ADR 0248 §2–§3)", () => {
  it("a failed import puts focus back on Import (#549)", async () => {
    await startImport();
    await act(async () => run.reject(new Error("database is locked")));
    expect(importButton()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(importButton());
  });

  it("a successful import focuses the report heading (#549)", async () => {
    await startImport();
    await act(async () => run.resolve({ items: [add] }));
    expect(document.activeElement).toBe(heading(p.reportTitle));
  });

  it("a plan refused at the click focuses the Import panel heading (#549)", async () => {
    await startImport();
    await act(async () => run.reject(refused));
    expect(importButton()).toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(heading(p.importTitle));
  });

  it("a failed import from the overwrite confirm focuses Import (#549)", async () => {
    await startImport(true);
    await act(async () => run.reject(new Error("database is locked")));
    expect(importButton()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(importButton());
  });

  it("a successful import from the overwrite confirm focuses the report heading (#549)", async () => {
    await startImport(true);
    await act(async () => run.resolve({ items: [add, update] }));
    expect(document.activeElement).toBe(heading(p.reportTitle));
  });

  it("leaves focus where the user moved it during the import", async () => {
    await startImport();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => run.resolve({ items: [add] }));
    expect(heading(p.reportTitle)).toBeTruthy();
    expect(document.activeElement).toBe(elsewhere);
  });
});
