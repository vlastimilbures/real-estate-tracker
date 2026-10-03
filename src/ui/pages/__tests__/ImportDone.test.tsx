// @vitest-environment jsdom
//
// UX-038: after a successful import the loaded files are cleared, so the same files
// cannot be imported twice by a second click.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Import } from "../Import";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { propertiesTemplate } from "../../../import/csv";
import { en } from "../../../i18n/en";

const importCsv = vi.fn(async () => ({
  upserted: { properties: 1, valuations: 0, leases: 0, mortgage_blocks: 0 },
}));

beforeEach(() =>
  act(() => {
    useUiStore.setState({ language: "en", route: "import" });
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: "ready",
      importCsv,
    } as never);
  }),
);

describe("Import after success (UX-038)", () => {
  it("clears the loaded files and offers no second import", async () => {
    const { container } = render(<Import />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([propertiesTemplate()], "properties.csv", {
      type: "text/csv",
    });
    await userEvent.upload(input, file);
    const run = await screen.findByRole("button", {
      name: en.importPage.importSelected,
    });
    await userEvent.click(run);
    await waitFor(() => expect(importCsv).toHaveBeenCalledTimes(1));
    await screen.findByText(en.importPage.reportTitle);
    expect(
      screen.queryByRole("button", { name: en.importPage.importSelected }),
    ).toBeNull();
    expect(
      screen.queryByText("properties.csv", { selector: "span.num" }),
    ).toBeNull();
  });
});
