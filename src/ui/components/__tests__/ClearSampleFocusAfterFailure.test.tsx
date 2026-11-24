// @vitest-environment jsdom
//
// ADR 0248 §1 (#549): the Clear sample dialog disables its buttons while it clears, which
// drops focus to <body>. After a failed clear focus goes to Cancel, unless the user moved
// it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearSampleButton } from "../ClearSampleDialog";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { deferred, type Deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";
import { failure, success } from "../../../__tests__/support/result";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

let clear: Deferred<{ safetyBackup: string }>;

beforeEach(() => {
  clear = deferred();
  act(() => {
    usePortfolioStore.setState({
      clearSample: () => clear.promise.then(success, failure),
    } as never);
  });
});

const confirm = () =>
  screen.getByRole("button", {
    name: new RegExp(`^(${en.sample.confirm}|${en.sample.clearing})$`),
  });
const cancel = () => screen.getByRole("button", { name: en.common.cancel });

async function startClear() {
  render(<ClearSampleButton />);
  await userEvent.click(
    screen.getByRole("button", { name: en.sample.clearAction }),
  );
  await userEvent.click(confirm());
  expect(confirm()).toHaveProperty("disabled", true);
}

describe("Clear sample focus after a failure (ADR 0248 §1)", () => {
  it("puts focus on Cancel after the fixup dropped it to <body> (#549)", async () => {
    await startClear();
    act(() => confirm().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => clear.reject(new Error("disk full")));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(cancel());
  });

  it("leaves focus where the user moved it during the clear", async () => {
    await startClear();
    const dialog = screen.getByRole("dialog");
    act(() => dialog.focus());
    await act(async () => clear.reject(new Error("disk full")));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(dialog);
  });
});
