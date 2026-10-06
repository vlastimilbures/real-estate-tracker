// @vitest-environment jsdom
//
// ADR 0141 (#125 R4-05, R5-07): a form's input errors stay in the form. A refused save
// shows its message once, in the form, and Cancel leaves nothing behind; a non-form
// action keeps the banner. Editing a field clears its error, and the scenario Name is
// marked required.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "../../components/AppShell";
import { EntityPanel } from "../../components/EntityPanel";
import { RecordForm } from "../../components/forms";
import { AssumptionsPanel } from "../Assumptions";
import { ScenarioForm } from "../ScenarioForm";
import { Scenarios } from "../Scenarios";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { describeWriteError } from "../../model/writeError";
import type { FieldSpec } from "../../model/formParse";
import type { WriteError } from "../../../state/writeError";
import { isoDate, money } from "../../../engine";
import type { MortgageBlock } from "../../../engine";
import type { Sql } from "../../../data/sql";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

// The compare runs the engine; the duplicate test only needs the list.
vi.mock("../ScenarioCompare", () => ({ CompareView: () => null }));

const en = getDict("en");

/** A label that starts with `label` (an Assumptions label ends with its help). */
const startsWith = (label: string) =>
  new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

/** The real store on a fresh seeded in-memory DB. */
async function initStore() {
  usePortfolioStore.setState({
    sql: null,
    portfolio: null,
    assumptions: null,
    scenarios: [],
    status: "idle",
    error: null,
    startupError: null,
  });
  await act(() => usePortfolioStore.getState().init(openSeeded));
}

// A test may stub saveAssumptions; each test starts with the store's own.
const storeSave = usePortfolioStore.getState().saveAssumptions;

beforeEach(() =>
  act(() => {
    useUiStore.setState({ language: "en", compareIds: [] });
    usePortfolioStore.setState({ saveAssumptions: storeSave });
  }),
);

describe("a refused form save stays in the form (R4-05)", () => {
  it("shows the message once, and nothing is left after Cancel (#125)", async () => {
    await initStore();
    const block = usePortfolioStore.getState().portfolio!.mortgages[0]!;
    const specs: FieldSpec[] = [
      { name: "value", label: "Value", kind: "money" },
    ];
    render(
      <AppShell title="Loans">
        <EntityPanel
          title="Loans"
          addLabel="loan"
          rows={[{ id: block.id, value: "1" }]}
          columns={[{ head: "Value", left: true, cell: (r) => r.value }]}
          specs={specs}
          draftOf={(r) => ({ value: r ? r.value : "" })}
          build={(v, id) => ({ id, value: String(v.value) })}
          onAdd={async () => ({ ok: true })}
          // A development loan without a term: the store refuses it (an input rule).
          onSave={() =>
            usePortfolioStore.getState().saveMortgageBlock({
              ...block,
              draws: [{ date: isoDate("2026-09-01"), amount: money("100") }],
              completionDate: isoDate("2028-10-10"),
            } as unknown as MortgageBlock)
          }
          onDelete={async () => ({ ok: true })}
        />
      </AppShell>,
    );
    await userEvent.click(screen.getByRole("button", { name: en.common.edit }));
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    const message = en.inputRules.MISSING_TERM_FOR_DEV_LOAN;
    expect(screen.getAllByText(message, { exact: false })).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(screen.queryAllByText(message, { exact: false })).toHaveLength(0);
  });

  it("a refused duplicate, with no form open, still shows the banner", async () => {
    await initStore();
    // Saved before ADR 0128: its shock takes the 4.5 % reset rate below 0.
    await usePortfolioStore
      .getState()
      .sql!.execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
        [
          "old",
          "Old",
          '{"version":1,"rateShock":{"deltaPa":"-0.05","durationYears":3}}',
          "2026-01-01T00:00:00.000Z",
        ],
      );
    await act(() => usePortfolioStore.getState().reload());
    render(<Scenarios />);
    await userEvent.click(
      screen.getByRole("button", { name: en.scenarios.duplicate }),
    );
    const error = usePortfolioStore.getState().error;
    expect(error?.kind).toBe("input");
    expect(screen.getByRole("alert").textContent).toBe(
      describeWriteError(en, error!).message,
    );
  });
});

describe("Assumptions shows a non-field input error in its summary", () => {
  // A rule on a field the form does not show: before, only the banner said so.
  const notOnAField: WriteError = {
    kind: "input",
    errors: [
      {
        code: "SHOCK_OUT_OF_RANGE",
        entity: "assumptions",
        field: "valueShock",
      },
    ],
  };

  /** Save an edit that the store refuses with `error`; returns the edited input. */
  async function refuseSave(error: WriteError) {
    act(() =>
      usePortfolioStore.setState({
        portfolio,
        assumptions,
        status: "ready",
        saveAssumptions: async () => ({ ok: false, error }),
      }),
    );
    render(<AssumptionsPanel />);
    const input = screen.getByLabelText(startsWith(en.assumptions.inflation));
    await userEvent.clear(input);
    await userEvent.type(input, "3");
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    return input;
  }

  it("shows a rule on no shown field there (#125)", async () => {
    const input = await refuseSave(notOnAField);
    const summary = document.querySelector(".error-summary");
    expect(summary?.textContent).toContain(
      describeWriteError(en, notOnAField).message,
    );
    expect(document.activeElement).toBe(summary);
    // The next edit drops it, like a field's own error.
    await userEvent.type(input, "5");
    expect(document.querySelector(".error-summary")).toBeNull();
  });

  it("leaves any other failure to the banner", async () => {
    await refuseSave({ kind: "other", message: "disk is full" });
    expect(document.querySelector(".error-summary")).toBeNull();
  });
});

describe("editing a field clears its error (R5-07)", () => {
  it("in RecordForm (#125)", async () => {
    render(
      <RecordForm
        specs={[{ name: "amount", label: "Amount", kind: "money" }]}
        initial={{ amount: "" }}
        submitLabel="Save"
        onSubmit={async () => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const input = screen.getByLabelText("Amount");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(input, "1");
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
  });

  it.fails("in RecordForm, by a field action's fill (#125)", async () => {
    render(
      <RecordForm
        specs={[{ name: "amount", label: "Amount", kind: "money" }]}
        initial={{ amount: "" }}
        submitLabel="Save"
        fieldActions={{
          amount: () => ({ label: "Fill", patch: { amount: "5" } }),
        }}
        onSubmit={async () => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const input = screen.getByLabelText("Amount");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("in Assumptions (#125)", async () => {
    act(() =>
      usePortfolioStore.setState({ portfolio, assumptions, status: "ready" }),
    );
    render(<AssumptionsPanel />);
    const input = screen.getByLabelText(startsWith(en.assumptions.inflation));
    await userEvent.clear(input);
    await userEvent.click(
      screen.getByRole("button", { name: en.common.saveChanges }),
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(input, "3");
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("in the scenario form (#125)", async () => {
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={async () => undefined}
        onCancel={() => undefined}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.create }),
    );
    const name = screen.getByLabelText(en.scenarios.name);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(name, "Crash");
    expect(name.getAttribute("aria-invalid")).not.toBe("true");
  });
});

describe("the scenario Name is marked required", () => {
  it("aria-required (#125)", () => {
    render(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={async () => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(
      screen.getByLabelText(en.scenarios.name).getAttribute("aria-required"),
    ).toBe("true");
  });
});
