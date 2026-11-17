// @vitest-environment jsdom
//
// ADR 0246 (#538): Create disables while the save runs, which drops its focus to <body>.
// After a failed save the scenario form puts focus back on it, unless the user moved it.
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioForm } from "../ScenarioForm";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import type { WriteError } from "../../../state/writeError";

const failure: WriteError = { kind: "other", message: "Disk full" };

/** The new-scenario form, named, whose save waits until `finish` settles it. */
async function renderForm() {
  let finish: (r: WriteError | undefined) => void = () => undefined;
  render(
    <ScenarioForm
      assumptions={assumptions}
      scenario={null}
      onSubmit={() =>
        new Promise<WriteError | undefined>((resolve) => (finish = resolve))
      }
      onCancel={() => undefined}
    />,
  );
  await userEvent.type(screen.getByLabelText(en.scenarios.name), "Crash");
  return { finish: (r: WriteError | undefined) => finish(r) };
}

const create = () =>
  screen.getByRole("button", {
    name: new RegExp(`^(${en.common.create}|${en.common.saving})$`),
  });

describe("ScenarioForm focus after a failed save (ADR 0246)", () => {
  it("puts focus back on Create after the fixup dropped it to <body>", async () => {
    const { finish } = await renderForm();
    await userEvent.click(create());
    expect(create()).toHaveProperty("disabled", true);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => create().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => finish(failure));
    expect(screen.getByRole("alert").textContent).toContain("Disk full");
    expect(document.activeElement).toBe(create());
  });

  it("leaves focus where the user moved it during the save", async () => {
    const { finish } = await renderForm();
    await userEvent.click(create());
    const name = screen.getByLabelText(en.scenarios.name);
    act(() => name.focus());
    await act(async () => finish(failure));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(name);
  });
});
