// @vitest-environment jsdom
//
// ADR 0147 (#122): a failed Clear sample is logged as a sample failure, not a backup one.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearSampleButton } from "../ClearSampleDialog";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { logFailure } from "../../../state/diagnostics";
import { en } from "../../../i18n/en";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

const clearSample = vi.fn();

beforeEach(() => {
  vi.mocked(logFailure).mockClear();
  clearSample.mockReset();
  act(() => {
    useUiStore.setState({ language: "en" });
    usePortfolioStore.setState({ clearSample } as never);
  });
});

describe("Clear sample failure (ADR 0147)", () => {
  it.fails("is logged as SAMPLE (#122)", async () => {
    const e = new Error("disk full");
    clearSample.mockRejectedValue(e);
    render(<ClearSampleButton />);

    await userEvent.click(
      screen.getByRole("button", { name: en.sample.clearAction }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.confirm }),
    );

    await waitFor(() => expect(logFailure).toHaveBeenCalled());
    expect(logFailure).toHaveBeenCalledWith("SAMPLE", e);
  });
});
