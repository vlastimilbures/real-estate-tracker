// @vitest-environment jsdom
//
// ADR 0212 (#389): the Import page lists its four file types as rows of one panel; each
// row is its own drop target and its controls name the type.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { valuationsTemplate } from "../../../state/csv";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";

const p = en.importPage;
const previewCsv = vi.fn();

beforeEach(() => {
  previewCsv.mockReset();
  previewCsv.mockResolvedValue({ items: [], problems: [], fingerprint: "f" });
  act(() => {
    useUiStore.setState({ language: "en", route: "import", lastImport: null });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      previewCsv,
    } as never);
  });
});

const types = [
  [p.propertiesTitle, "properties.csv"],
  [p.valuationsTitle, "valuations.csv"],
  [p.rentsTitle, "rents.csv"],
  [p.mortgagesTitle, "mortgages.csv"],
] as const;

const rowOf = (title: string) =>
  screen.getByText(title, { selector: ".import-row-type" }).closest("li")!;

const valuations = () =>
  new File([valuationsTemplate()], "my-valuations.csv", { type: "text/csv" });

describe("Import files: one panel, one row per type (ADR 0212 §1)", () => {
  it("lists the four types in order with their file names, in one panel", () => {
    render(<Import />);
    const panel = screen
      .getByRole("heading", { name: p.filesTitle })
      .closest("section, .panel") as HTMLElement;
    const rows = within(panel).getAllByRole("listitem");
    expect(
      rows.map((r) => r.querySelector(".import-row-type")?.textContent),
    ).toEqual(types.map(([title]) => title));
    expect(
      rows.map((r) => r.querySelector(".import-row-file")?.textContent),
    ).toEqual(types.map(([, file]) => file));
    expect(within(panel).getByText(p.dropOnRow)).toBeTruthy();
    // The old per-type panels are gone.
    expect(
      screen.queryByRole("heading", { name: p.valuationsTitle }),
    ).toBeNull();
  });

  it("each control's name says its type (§3)", () => {
    render(<Import />);
    for (const [title] of types) {
      const row = rowOf(title);
      expect(
        within(row).getByRole("button", { name: p.chooseFileFor(title) }),
      ).toBeTruthy();
      expect(
        within(row).getByRole("button", { name: p.templateFor(title) }),
      ).toBeTruthy();
    }
  });

  it("a chosen file's name, status and re-upload sit on its row", async () => {
    const { container } = render(<Import />);
    const inputs = container.querySelectorAll('input[type="file"]');
    await userEvent.upload(inputs[1] as HTMLInputElement, valuations());
    await waitFor(() => expect(previewCsv).toHaveBeenCalled());
    const row = rowOf(p.valuationsTitle);
    expect(row.querySelector(".import-row-file")?.textContent).toBe(
      "my-valuations.csv",
    );
    expect(within(row).getByText(p.rowsReady(1))).toBeTruthy();
    const again = within(row).getByRole("button", {
      name: p.reuploadFor(p.valuationsTitle, "my-valuations.csv"),
    });
    expect(again.textContent).toBe(p.reuploadShort);
  });
});

describe("each row is its own drop target (ADR 0212 §2)", () => {
  it("a file dropped on a row is that row's type, whatever its name", async () => {
    render(<Import />);
    const row = rowOf(p.valuationsTitle);
    fireEvent.dragOver(row, { dataTransfer: { files: [] } });
    expect(row.className).toContain("drag-over");
    // Named like a properties file, dropped on Valuations: read as valuations.
    const f = new File([valuationsTemplate()], "properties.csv", {
      type: "text/csv",
    });
    fireEvent.drop(row, { dataTransfer: { files: [f] } });
    expect(row.className).not.toContain("drag-over");
    await waitFor(() =>
      expect(within(row).getByText(p.rowsReady(1))).toBeTruthy(),
    );
    expect(
      rowOf(p.propertiesTitle).querySelector(".import-row-file")?.textContent,
    ).toBe("properties.csv");
    expect(
      within(rowOf(p.propertiesTitle)).queryByText(p.rowsReady(1)),
    ).toBeNull();
  });

  it("leaving the row clears the drag-over state", () => {
    render(<Import />);
    const row = rowOf(p.rentsTitle);
    fireEvent.dragOver(row, { dataTransfer: { files: [] } });
    fireEvent.dragLeave(row);
    expect(row.className).not.toContain("drag-over");
  });
});

describe("a file's errors sit under its row (ADR 0212 §4)", () => {
  it("lists the errors in a table inside the row", async () => {
    const { container } = render(<Import />);
    const inputs = container.querySelectorAll('input[type="file"]');
    await userEvent.upload(
      inputs[1] as HTMLInputElement,
      new File(
        [
          "property_name,valid_from,valid_to,market_value\nByt Javorova,not-a-date,,10200000\n",
        ],
        "v.csv",
        { type: "text/csv" },
      ),
    );
    const row = rowOf(p.valuationsTitle);
    await waitFor(() =>
      expect(within(row).getByText(p.errorsBadge(1))).toBeTruthy(),
    );
    expect(row.querySelector("table")).not.toBeNull();
  });
});

describe("translated names (ADR 0212 §3)", () => {
  it("cs and ru name the type in each control", () => {
    for (const t of [cs, ru]) {
      expect(
        t.importPage.chooseFileFor(t.importPage.valuationsTitle),
      ).toContain(t.importPage.valuationsTitle);
      expect(t.importPage.templateFor(t.importPage.valuationsTitle)).toContain(
        t.importPage.valuationsTitle,
      );
      expect(
        t.importPage.reuploadFor(t.importPage.valuationsTitle, "v.csv"),
      ).toContain("v.csv");
    }
  });
});
