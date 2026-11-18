// @vitest-environment jsdom
//
// ADR 0248 §1 (#549): the confirm row disables its buttons while the write runs, which
// drops focus to <body>. After a failed write focus goes to Cancel, the safe choice,
// unless the user moved it.
import { describe, it, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmRow } from "../EntityPanelParts";
import type { MutationResult } from "../../../state/portfolioStore";
import { deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

const failure: MutationResult = {
  ok: false,
  error: { kind: "other", message: "Disk full" },
};

function renderRow() {
  const write = deferred<MutationResult>();
  render(
    <>
      <ConfirmRow
        message="Delete this record?"
        confirmLabel={en.common.yesDelete}
        busyLabel={en.common.deleting}
        onConfirm={() => write.promise}
        onCancel={() => undefined}
      />
      <button type="button">Elsewhere</button>
    </>,
  );
  return write;
}

const yes = () =>
  screen.getByRole("button", {
    name: new RegExp(`^(${en.common.yesDelete}|${en.common.deleting})$`),
  });
const cancel = () => screen.getByRole("button", { name: en.common.cancel });

describe("ConfirmRow focus after a failed write (ADR 0248 §1)", () => {
  it("puts focus on Cancel after the fixup dropped it to <body> (#549)", async () => {
    const write = renderRow();
    await userEvent.click(yes());
    expect(yes()).toHaveProperty("disabled", true);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => yes().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => write.resolve(failure));
    expect(screen.getByRole("alert").textContent).toContain("Disk full");
    expect(document.activeElement).toBe(cancel());
  });

  it("leaves focus where the user moved it during the write", async () => {
    const write = renderRow();
    await userEvent.click(yes());
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => write.resolve(failure));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(elsewhere);
  });
});
