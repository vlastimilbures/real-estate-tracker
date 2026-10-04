// @vitest-environment jsdom
//
// ADR 0123 (#108): the scenario form shows a rule the store refuses on its field, keeps
// the new scenario's id across a retry and ignores a second submit while saving.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioForm } from "../ScenarioForm";
import { useUiStore } from "../../../state/uiStore";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import type { Scenario } from "../../../engine";
import type { WriteError } from "../../../state/writeError";

const s = en.scenarios;

const crashRefused: WriteError = {
  kind: "input",
  errors: [
    { code: "SHOCK_OUT_OF_RANGE", entity: "assumptions", field: "valueShock" },
  ],
};

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

function renderForm(onSubmit: (s: Scenario) => Promise<void | WriteError>) {
  render(
    <ScenarioForm
      assumptions={assumptions}
      scenario={null}
      onSubmit={onSubmit}
      onCancel={() => undefined}
    />,
  );
}

async function fillCrash(pct: string) {
  await userEvent.type(screen.getByLabelText(s.name), "Crash");
  await userEvent.type(screen.getByLabelText(s.fieldValueCrash), pct);
}

describe("ScenarioForm save (ADR 0123)", () => {
  it("shows the store's refusal on Value crash and stays open", async () => {
    const onSubmit = vi.fn(() => Promise.resolve(crashRefused));
    renderForm(onSubmit);
    await fillCrash("-20");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );

    const crash = screen.getByLabelText(s.fieldValueCrash);
    expect(crash.getAttribute("aria-invalid")).toBe("true");
    const errId = crash.getAttribute("aria-describedby")!.split(" ").at(-1)!;
    expect(document.getElementById(errId)?.textContent).toBe(
      en.inputRules.SHOCK_OUT_OF_RANGE,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("says that 20 means a 20 % drop", () => {
    renderForm(() => Promise.resolve());
    const crash = screen.getByLabelText(s.fieldValueCrash);
    const ids = crash.getAttribute("aria-describedby")!.split(" ");
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      s.permanentCorrection,
    );
    expect(s.permanentCorrection).toMatch(/20/);
  });

  it("submits once while saving and keeps the new id for a retry", async () => {
    let finish: (r: WriteError | undefined) => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<WriteError | undefined>((resolve) => {
          finish = resolve;
        }),
    );
    renderForm(onSubmit);
    await fillCrash("20");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );
    // A second Return while the first save runs (the button is disabled by then).
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => finish(crashRefused));
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(2);
    const [first, second] = onSubmit.mock.calls.map(
      (c) => (c as unknown as [Scenario])[0],
    );
    expect(second!.id).toBe(first!.id);
  });
});
