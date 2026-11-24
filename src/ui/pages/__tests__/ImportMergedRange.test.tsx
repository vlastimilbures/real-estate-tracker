// @vitest-environment jsdom
//
// ADR 0257 §2: a merged row the import plan refuses for an out-of-range value shows in the
// "Import refused" table with the range text the parse step uses (forms.intRange,
// forms.sizeRange, the one range message of ADR 0259), on its file, row and column.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { en } from "../../../i18n/en";

const previewCsv = vi.fn();

beforeEach(() => {
  previewCsv.mockReset();
  previewCsv.mockResolvedValue({
    items: [],
    problems: [
      {
        file: "mortgages",
        row: 2,
        field: "fixation_years",
        problem: { code: "outOfRange", value: "60", min: 0, max: 50 },
      },
      {
        file: "mortgages",
        row: 3,
        field: "size_m2",
        problem: { code: "sizeRange", value: "20000", min: 1, max: 10000 },
      },
    ],
  });
  act(() => {
    usePortfolioStore.setState({ previewCsv } as never);
  });
});

describe("a merged row out of range (ADR 0257)", () => {
  it("shows the CSV range text in the Import refused table", async () => {
    const { container } = renderWithPortfolio(<Import />, { route: "import" });
    const input = container.querySelectorAll(
      'input[type="file"]',
    )[3] as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(
        [
          "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years\n" +
            "Byt Javorova,2020-01-01,1000000,5,0.05,6000,30\n",
        ],
        "mortgages.csv",
        { type: "text/csv" },
      ),
    );
    const refused = await screen.findByRole("region", {
      name: en.importPage.importRefused,
    });
    expect(
      within(refused).getByText("Must be a whole number from 0 to 50"),
    ).toBeTruthy();
    expect(
      within(refused).getByText(
        "Must be a number from 1 to 10 000 with at most one decimal place",
      ),
    ).toBeTruthy();
  });
});
