// @vitest-environment jsdom
//
// ADR 0096 (#34): the Import page previews adds and updates, asks before overwriting,
// refuses a plan that changed since the preview, and keeps the report with links.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { propertiesTemplate } from "../../../import/csv";
import {
  CsvPlanChangedError,
  type CsvImportPreview,
  type ImportItem,
} from "../../../import/csvImport";
import { en } from "../../../i18n/en";

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

const plan = (
  items: ImportItem[],
  fingerprint = "plan-1",
): CsvImportPreview => ({
  items,
  problems: [],
  fingerprint,
});

const previewCsv = vi.fn();
const importCsv = vi.fn();

beforeEach(() => {
  previewCsv.mockReset();
  importCsv.mockReset();
  act(() => {
    useUiStore.setState({
      language: "en",
      route: "import",
      lastImport: null,
      unsavedChanges: false,
    });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      importCsv,
      previewCsv,
    } as never);
  });
});

async function choosePropertiesFile(container: HTMLElement) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await userEvent.upload(
    input,
    new File([propertiesTemplate()], "properties.csv", { type: "text/csv" }),
  );
}

describe("Import preview (ADR 0096)", () => {
  it("a date before 1900 is refused with a message that names the floor (ADR 0149)", async () => {
    const [header] = propertiesTemplate().split("\n");
    const csv = `${header}\nA,,,,,1850-01-01,100,,,,,\n`;
    const { container } = render(<Import />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File([csv], "properties.csv", { type: "text/csv" }),
    );
    expect(
      await screen.findByText(p.errEarlyDate("1850-01-01", "1900-01-01")),
    ).toBeTruthy();
  });

  it("a failed preview shows why Import is unavailable (#122)", async () => {
    previewCsv.mockRejectedValue(new Error("disk I/O error"));
    const { container } = render(<Import />);
    await choosePropertiesFile(container);

    await waitFor(() => expect(previewCsv).toHaveBeenCalled());
    expect(
      await screen.findByText(
        /could not be checked against your saved data.*disk I\/O error/,
      ),
    ).toBeTruthy();
  });

  it("the failed-preview error goes once the files are previewed again (ADR 0147)", async () => {
    previewCsv.mockRejectedValueOnce(new Error("disk I/O error"));
    previewCsv.mockResolvedValue(plan([add]));
    const { container } = render(<Import />);
    await choosePropertiesFile(container);
    await screen.findByText(/could not be checked/);

    await choosePropertiesFile(container);

    expect(
      await screen.findByText(p.willAdd(1), { selector: "summary" }),
    ).toBeTruthy();
    expect(screen.queryByText(/could not be checked/)).toBeNull();
  });

  it("imports a pure-add plan on the first press, with the previewed plan", async () => {
    previewCsv.mockResolvedValue(plan([add]));
    importCsv.mockResolvedValue({
      upserted: { properties: 1, valuations: 0, leases: 0, mortgage_blocks: 0 },
      items: [add],
    });
    const { container } = render(<Import />);
    await choosePropertiesFile(container);

    expect(
      await screen.findByText(p.willAdd(1), { selector: "summary" }),
    ).toBeTruthy();
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    );

    await waitFor(() => expect(importCsv).toHaveBeenCalledTimes(1));
    expect(importCsv.mock.calls[0]?.[1]).toBe("plan-1");
    expect(screen.queryByText(p.confirmOverwriteMsg(1))).toBeNull();
  });

  it("shows each update's changes and asks before overwriting", async () => {
    previewCsv.mockResolvedValue(plan([add, update], "plan-2"));
    importCsv.mockResolvedValue({
      upserted: { properties: 2, valuations: 0, leases: 0, mortgage_blocks: 0 },
      items: [add, update],
    });
    const { container } = render(<Import />);
    await choosePropertiesFile(container);

    expect(await screen.findByText("Lipova 5 → Lipova 7")).toBeTruthy();
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(2, 1, 1) }),
    );
    expect(screen.getByText(p.confirmOverwriteMsg(1))).toBeTruthy();
    expect(importCsv).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: p.confirmOverwrite(1) }),
    );
    await waitFor(() => expect(importCsv).toHaveBeenCalledTimes(1));
    expect(importCsv.mock.calls[0]?.[1]).toBe("plan-2");
  });

  it("Cancel on the confirm row imports nothing", async () => {
    previewCsv.mockResolvedValue(plan([update]));
    const { container } = render(<Import />);
    await choosePropertiesFile(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 0, 1) }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(screen.queryByText(p.confirmOverwriteMsg(1))).toBeNull();
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("a change to the stored data closes the confirm row and previews again", async () => {
    previewCsv.mockResolvedValue(plan([update]));
    const { container } = render(<Import />);
    await choosePropertiesFile(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 0, 1) }),
    );
    expect(screen.getByText(p.confirmOverwriteMsg(1))).toBeTruthy();
    const calls = previewCsv.mock.calls.length;

    act(() => usePortfolioStore.setState({ portfolio: { ...portfolio } }));
    expect(screen.queryByText(p.confirmOverwriteMsg(1))).toBeNull();
    await waitFor(() => expect(previewCsv).toHaveBeenCalledTimes(calls + 1));
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("a plan with problems shows them and offers no import", async () => {
    previewCsv.mockResolvedValue({
      items: [],
      problems: [
        {
          file: "rents",
          row: 2,
          field: "property_name",
          problem: { code: "unknownProperty", value: "Nope" },
        },
      ],
      fingerprint: "plan-x",
    });
    const { container } = render(<Import />);
    await choosePropertiesFile(container);
    expect(await screen.findByText(p.errUnknownProperty("Nope"))).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: p.importSelected,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("a plan that changed since the preview says so and shows the new plan", async () => {
    previewCsv.mockResolvedValue(plan([add]));
    importCsv.mockRejectedValue(
      new CsvPlanChangedError(plan([update], "plan-3")),
    );
    const { container } = render(<Import />);
    await choosePropertiesFile(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    expect(await screen.findByText(p.planChanged)).toBeTruthy();
    expect(screen.getByText("Lipova 5 → Lipova 7")).toBeTruthy();
    expect(screen.queryByText(p.reportTitle)).toBeNull();
  });
});

describe("Import report (ADR 0096)", () => {
  it("survives leaving the page and links to each property", async () => {
    previewCsv.mockResolvedValue(plan([add]));
    importCsv.mockResolvedValue({
      upserted: { properties: 1, valuations: 0, leases: 0, mortgage_blocks: 0 },
      items: [add],
    });
    const first = render(<Import />);
    await choosePropertiesFile(first.container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    await screen.findByText(p.reportTitle);
    first.unmount();

    // Back on the page later: the report is still there.
    render(<Import />);
    expect(screen.getByText(p.reportTitle)).toBeTruthy();
    await userEvent.click(
      screen.getByText(p.added(1), { selector: "summary" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Byt Javorova" }));
    expect(useUiStore.getState().route).toBe("property");
    expect(useUiStore.getState().selectedPropertyId).toBe("byt-javorova");
  });
});
