// @vitest-environment jsdom
//
// ADR 0160 (#116): the Import page says how a CSV meets the loan events stored on a
// mortgage block: a refusal names the stored event, an added block lists the events it
// stops and asks first, and a block without effect is noted.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { propertiesTemplate } from "../../../import/csv";
import type { CsvImportPreview, ImportItem } from "../../../import/csvImport";
import { en } from "../../../i18n/en";

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
  fingerprint: "plan-1",
});

const previewCsv = vi.fn();
const importCsv = vi.fn();

beforeEach(() => {
  previewCsv.mockReset();
  importCsv.mockReset();
  importCsv.mockResolvedValue({
    upserted: { properties: 0, valuations: 0, leases: 0, mortgage_blocks: 1 },
    items: [replacing],
  });
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
    previewCsv.mockResolvedValue({
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
      fingerprint: "plan-x",
    });
    const { container } = render(<Import />);
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
    previewCsv.mockResolvedValue(plan([replacing]));
    const { container } = render(<Import />);
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
    expect(importCsv.mock.calls[0]?.[1]).toBe("plan-1");
  });

  it("with updates too, the confirm row names both and keeps the overwrite button", async () => {
    previewCsv.mockResolvedValue(plan([replacing, update]));
    const { container } = render(<Import />);
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
      plan([{ ...block, date: "2021-01-07", noEffect: true }]),
    );
    const { container } = render(<Import />);
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
          upserted: {
            properties: 0,
            valuations: 0,
            leases: 0,
            mortgage_blocks: 1,
          },
          items: [replacing],
        },
      }),
    );
    render(<Import />);
    expect(
      screen.getByText(p.replacedEvent(issue.RECAST_REPLACED("17.01.2033"))),
    ).toBeTruthy();
  });
});
