// @vitest-environment jsdom
//
// ADR 0236 §1: a CSV size with two or more decimals is refused with a message naming
// the limit.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { en } from "../../../i18n/en";

const previewCsv = vi.fn();

beforeEach(() => {
  previewCsv.mockReset();
  previewCsv.mockResolvedValue({ items: [], problems: [], fingerprint: "f" });
  act(() => {
    usePortfolioStore.setState({ previewCsv } as never);
  });
});

describe("a CSV size with two decimals (ADR 0236 §1)", () => {
  it("lists the size error naming the range and one decimal place", async () => {
    const { container } = renderWithPortfolio(<Import />, { route: "import" });
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(
        ["name,size_m2,purchase_date,purchase_price\nA,54.55,2020-01-01,100\n"],
        "properties.csv",
        { type: "text/csv" },
      ),
    );
    const text = en.importPage.errSizeDecimals("54.55", "1", "10 000");
    await waitFor(() =>
      expect(
        screen.getByText((_, el) =>
          el?.tagName === "TD"
            ? (el.textContent ?? "").replace(/\s/g, " ") ===
              text.replace(/\s/g, " ")
            : false,
        ),
      ).toBeTruthy(),
    );
  });
});
