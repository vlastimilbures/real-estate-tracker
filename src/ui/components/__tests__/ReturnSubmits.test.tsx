// @vitest-environment jsdom
//
// UX-028: pressing Return in a form field saves the form, a tranche row's cells included
// (ADR 0167), and picking a day in the calendar popover does not submit.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../forms";
import { PropertyFormModal } from "../PropertyFormModal";
import { ScenarioForm } from "../../pages/ScenarioForm";
import { AssumptionsPanel } from "../../pages/Assumptions";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import type { FieldSpec } from "../../model/formParse";

const en = getDict("en");

// DateInput loads the calendar on the first open (DR-009). Load its module up front:
// under coverage the first transform can outlast findBy's 1 s wait.
beforeAll(async () => {
  await import("../DateCalendar");
});

beforeEach(() =>
  act(() => {
    useUiStore.setState({ language: "en" });
    usePortfolioStore.setState({ portfolio, assumptions, status: "ready" });
  }),
);

const specs: FieldSpec[] = [
  { name: "price", label: "Price", kind: "money" },
  { name: "start", label: "Start", kind: "date", optional: true },
  { name: "draws", label: "Draws", kind: "draws", optional: true },
];

function renderRecordForm() {
  const onSubmit = vi.fn();
  render(
    <RecordForm
      specs={specs}
      initial={{ price: "" }}
      submitLabel="Save"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe("Return submits forms (UX-028)", () => {
  it("RecordForm saves once on Return in a field", async () => {
    const onSubmit = renderRecordForm();
    await userEvent.type(screen.getByLabelText("Price"), "100{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Return in a tranche row saves like any field (ADR 0167)", async () => {
    const onSubmit = renderRecordForm();
    await userEvent.type(screen.getByLabelText("Price"), "100");
    await userEvent.click(
      screen.getByRole("button", { name: en.propertyDetail.addTranche }),
    );
    const row = screen.getByRole("group", {
      name: en.propertyDetail.trancheRow(1),
    });
    await userEvent.type(
      within(row).getByLabelText(en.propertyDetail.eventDate),
      "01.02.2027",
    );
    await userEvent.type(
      within(row).getByLabelText(en.propertyDetail.eventAmount),
      "500000{Enter}",
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("picking a day in the calendar does not save", async () => {
    const onSubmit = renderRecordForm();
    await userEvent.type(screen.getByLabelText("Price"), "100");
    await userEvent.click(
      screen.getByRole("button", { name: en.calendar.open }),
    );
    await screen.findByRole("dialog", { name: en.calendar.open });
    const day = document.querySelector<HTMLButtonElement>(
      ".date-popover .rdp-day button, .date-popover button.rdp-day_button",
    )!;
    await userEvent.click(day);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Add property validates on Return", async () => {
    const addProperty = vi.fn();
    act(() => usePortfolioStore.setState({ addProperty }));
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await userEvent.type(
      screen.getByLabelText(en.propertyForm.name),
      "New flat{Enter}",
    );
    // The blank required fields are flagged: the save path ran.
    expect(document.querySelector(".field.invalid")).not.toBeNull();
  });

  it("New scenario saves on Return", async () => {
    const onSubmit = vi.fn();
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    await userEvent.type(
      screen.getByLabelText(en.scenarios.name),
      "Stress{Enter}",
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Assumptions save on Return", async () => {
    const saveAssumptions = vi.fn(async () => ({ ok: true as const }));
    act(() => usePortfolioStore.setState({ saveAssumptions }));
    render(<AssumptionsPanel />);
    // An edit first: Save is disabled while nothing changed (ADR 0095).
    const horizon = screen.getByLabelText(en.assumptions.horizon);
    await userEvent.clear(horizon);
    await userEvent.type(horizon, "25{Enter}");
    expect(saveAssumptions).toHaveBeenCalledTimes(1);
  });
});
