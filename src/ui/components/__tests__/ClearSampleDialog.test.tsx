// @vitest-environment jsdom
//
// ADR 0147 (#122): a failed Clear sample is logged as a sample failure, not a backup one.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearSampleButton } from "../ClearSampleDialog";
import { invoke } from "@tauri-apps/api/core";
import { portfolioDb, usePortfolioStore } from "../../../state/portfolioStore";
import { logFailure } from "../../../state/diagnostics";
import { en } from "../../../i18n/en";
import { openSeeded } from "../../../state/__tests__/support/openSeeded";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

/** The real store on the seed, whose writes fail with `e` after the safety backup:
 *  the store logs the failure where it catches it (ADR 0147, #467). */
async function writesFail(e: Error) {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const sql = await openSeeded();
  await act(() => usePortfolioStore.getState().init(async () => sql));
  portfolioDb.set({ ...sql, transaction: () => Promise.reject(e) });
}

beforeEach(() => {
  vi.mocked(logFailure).mockClear();
});

describe("Clear sample failure (ADR 0147)", () => {
  it("is logged as SAMPLE (#122)", async () => {
    const e = new Error("disk full");
    await writesFail(e);
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
