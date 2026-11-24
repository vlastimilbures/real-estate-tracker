// @vitest-environment jsdom
//
// #464: the English text the Import page shows for an out-of-range fixation, a loan term
// of 0, an out-of-range size and a date before the floor, pinned literally so moving the
// input rules cannot change it.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";

const previewCsv = vi.fn();

beforeEach(() => {
  previewCsv.mockReset();
  previewCsv.mockResolvedValue({ items: [], problems: [] });
  act(() => {
    usePortfolioStore.setState({ previewCsv } as never);
  });
});

/** A table cell whose text is exactly `text`. */
const cell = (text: string) =>
  screen.getByText((_, el) =>
    el?.tagName === "TD" ? el.textContent === text : false,
  );

/** Upload `csv` on the row of file input `index` (0 properties … 3 mortgages). */
async function upload(index: number, name: string, csv: string) {
  const { container } = renderWithPortfolio(<Import />, { route: "import" });
  const input = container.querySelectorAll('input[type="file"]')[
    index
  ] as HTMLInputElement;
  await userEvent.upload(input, new File([csv], name, { type: "text/csv" }));
}

describe("Import range messages (English)", () => {
  it("names the size range and the date floor", async () => {
    await upload(
      0,
      "properties.csv",
      "name,size_m2,purchase_date,purchase_price\n" +
        "A,10000.1,2020-01-01,100\n" +
        "B,50,1899-12-31,100\n",
    );
    await waitFor(() =>
      expect(
        cell(
          "Must be a number from 1 to 10 000 with at most one decimal place",
        ),
      ).toBeTruthy(),
    );
    expect(
      cell(
        '"1899-12-31" is before 1900-01-01, the earliest date the app accepts — check the year for a typo',
      ),
    ).toBeTruthy();
  });

  it("names the fixation range and a loan term of 0", async () => {
    await upload(
      3,
      "mortgages.csv",
      "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years\n" +
        "Byt Javorova,2020-01-01,1000000,51,0.05,6000,30\n" +
        "Byt Lipova,2020-01-01,1000000,5,0.05,6000,0\n",
    );
    await waitFor(() =>
      expect(cell("Must be a whole number from 0 to 50")).toBeTruthy(),
    );
    expect(cell('"0" — the loan term must be at least one year')).toBeTruthy();
  });
});
