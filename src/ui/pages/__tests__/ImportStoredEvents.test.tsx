// @vitest-environment jsdom
//
// ADR 0160 (#116): the Import page says how a CSV meets the loan events stored on a
// mortgage block: a refusal names the stored event, an added block lists the events it
// stops and asks first, and a block without effect is noted.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { propertiesTemplate } from "../../../import/csv";
import { type CsvImportPreview, type ImportItem } from "../../../state/csv";
import { en } from "../../../i18n/en";
import { success } from "../../../__tests__/support/result";

const p = en.importPage;
const issue = en.propertyDetail.eventIssue;

const block: ImportItem = {
  file: "mortgages",
  row: 2,
  kind: "add",
  propertyId: "byt-javorova",
  propertyName: "Byt Javorova",
  date: "2031-01-17",
  changes: [],
};
const replacing: ImportItem = {
  ...block,
  replaces: [
    { kind: "recast", date: "2033-01-17" },
    { kind: "prepayment", date: "2040-01-17" },
  ],
};
const update: ImportItem = {
  ...block,
  row: 3,
  kind: "update",
  date: "2021-01-17",
  changes: [{ field: "interest_rate_pa", before: "0.0169", after: "0.0179" }],
};

const plan = (items: ImportItem[]): CsvImportPreview => ({
  items,
  problems: [],
});

const previewCsv = vi.fn();
const importCsv = vi.fn();

beforeEach(() => {
  previewCsv.mockReset();
  importCsv.mockReset();
  importCsv.mockResolvedValue(
    success({
      items: [replacing],
    }),
  );
  act(() => {
    usePortfolioStore.setState({ importCsv, previewCsv } as never);
  });
});

/** Any valid file starts a preview; its plan comes from the mock. */
async function chooseFile(container: HTMLElement) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await userEvent.upload(
    input,
    new File([propertiesTemplate()], "properties.csv", { type: "text/csv" }),
  );
}

describe("Import and stored loan events (ADR 0160)", () => {
  it("a refusal names the stored event and its date, not a CSV column", async () => {
    previewCsv.mockResolvedValue(
      success({
        items: [],
        problems: [
          {
            file: "mortgages",
            row: 2,
            field: "",
            problem: {
              code: "storedEvent",
              list: "prepayments",
              date: "2045-01-17",
              rule: "EVENT_AFTER_SCHEDULE_END",
            },
          },
        ],
      }),
    );
    const { container } = renderWithPortfolio(<Import />, { route: "import" });
    await chooseFile(container);
    expect(
      await screen.findByText(
        p.errStoredEvent(
          p.storedEventKind.prepayments,
          "17.01.2045",
          en.inputRules.EVENT_AFTER_SCHEDULE_END,
        ),
      ),
    ).toBeTruthy();
    expect(screen.queryByText("prepayments", { selector: "code" })).toBeNull();
  });

  it("an added block lists the events it stops and asks before importing", async () => {
    previewCsv.mockResolvedValue(success(plan([replacing])));
    const { container } = renderWithPortfolio(<Import />, { route: "import" });
    await chooseFile(container);

    expect(
      await screen.findByText(
        p.replacedEvent(issue.RECAST_REPLACED("17.01.2033")),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        p.replacedEvent(issue.PREPAYMENT_REPLACED("17.01.2040")),
      ),
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    expect(screen.getByText(p.confirmReplaceMsg(1))).toBeTruthy();
    expect(screen.queryByText(p.confirmOverwriteMsg(0))).toBeNull();
    expect(importCsv).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: p.confirmReplace }),
    );
    await waitFor(() => expect(importCsv).toHaveBeenCalledTimes(1));
    // The import is sent the chosen rows only and builds its own plan (ADR 0229).
    expect(importCsv.mock.calls[0]).toEqual([
      expect.objectContaining({ properties: expect.any(Array) }),
    ]);
  });

  it("Cancel on the replace confirmation imports nothing", async () => {
    previewCsv.mockResolvedValue(success(plan([replacing])));
    const { container } = renderWithPortfolio(<Import />, { route: "import" });
    await chooseFile(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(screen.queryByText(p.confirmReplaceMsg(1))).toBeNull();
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("a portfolio change closes the replace confirmation (#286)", async () => {
    previewCsv.mockResolvedValue(success(plan([replacing])));
    const { container } = renderWithPortfolio(<Import />, { route: "import" });
    await chooseFile(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    expect(screen.getByText(p.confirmReplaceMsg(1))).toBeTruthy();

    act(() => usePortfolioStore.setState({ portfolio: { ...portfolio } }));
    expect(screen.queryByText(p.confirmReplaceMsg(1))).toBeNull();
    expect(importCsv).not.toHaveBeenCalled();
  });

  it("with updates too, the confirm row names both and keeps the overwrite button", async () => {
    previewCsv.mockResolvedValue(success(plan([replacing, update])));
    const { container } = renderWithPortfolio(<Import />, { route: "import" });
    await chooseFile(container);
    await userEvent.click(
      await screen.findByRole("button", { name: p.importScope(2, 1, 1) }),
    );
    expect(screen.getByText(p.confirmOverwriteMsg(1))).toBeTruthy();
    expect(screen.getByText(p.confirmReplaceMsg(1))).toBeTruthy();
    expect(
      screen.getByRole("button", { name: p.confirmOverwrite(1) }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: p.confirmReplace })).toBeNull();
  });

  it("a block without effect is noted and imports on the first press", async () => {
    previewCsv.mockResolvedValue(
      success(plan([{ ...block, date: "2021-01-07", noEffect: true }])),
    );
    const { container } = renderWithPortfolio(<Import />, { route: "import" });
    await chooseFile(container);
    expect(await screen.findByText(p.noEffectNote)).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: p.importScope(1, 1, 0) }),
    );
    await waitFor(() => expect(importCsv).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(p.confirmReplaceMsg(1))).toBeNull();
  });

  it("the report keeps the replaced events", async () => {
    act(() =>
      useUiStore.setState({
        lastImport: {
          items: [replacing],
        },
      }),
    );
    renderWithPortfolio(<Import />, { route: "import" });
    expect(
      screen.getByText(p.replacedEvent(issue.RECAST_REPLACED("17.01.2033"))),
    ).toBeTruthy();
  });
});
