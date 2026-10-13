// @vitest-environment jsdom
//
// ADR 0185 §5: a file with no data rows is not shown as success. Its badge says so, and
// "already up to date" needs at least one record in the preview.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

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

describe("a CSV file with no data rows (ADR 0185 §5)", () => {
  it("shows a neutral no-data badge and no up-to-date line", async () => {
    const { container } = render(<Import />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(["name,purchase_date,purchase_price\n"], "properties.csv", {
        type: "text/csv",
      }),
    );
    await waitFor(() => expect(previewCsv).toHaveBeenCalled());
    expect(screen.getByText(p.noDataRows)).toBeTruthy();
    expect(screen.queryByText(p.rowsReady(0))).toBeNull();
    expect(screen.queryByText(p.nothingToImport)).toBeNull();
  });
});
