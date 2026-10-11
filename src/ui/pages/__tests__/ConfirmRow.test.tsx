// @vitest-environment jsdom
//
// ADR 0143 (#132 R5-08): an inline destructive confirm names the record, moves focus to
// its Cancel button (and back to the trigger on Cancel), and stays open with the reason
// when the write fails.
import { useState } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LeasesPanel,
  MortgagesPanel,
  ValuationsPanel,
} from "../PropertyEntityPanels";
import { ScenarioListPanel } from "../ScenariosPanels";
import { ActivationBanner } from "../PropertyDetailPanels";
import { Properties } from "../Properties";
import { EntityPanel } from "../../components/EntityPanel";
import { LeaveGuard } from "../../components/LeaveGuard";
import { usePortfolioStore } from "../../../state/portfolioStore";
import type { MutationResult } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { fmtDate } from "../../../lib/format";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { isoDate, money, type Lease, type Valuation } from "../../../engine";
import type { FieldSpec } from "../../model/formParse";

vi.mock("../../../lib/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/day")>()),
  todayUtc: () => new Date(Date.UTC(2026, 9, 1)),
}));

const ok = async (): Promise<MutationResult> => ({ ok: true });
const gone: MutationResult = {
  ok: false,
  error: { kind: "data", code: "ROW_MISSING", details: ["scenarios s1"] },
};

const valuation: Valuation = {
  id: "v1",
  propertyId: "p1",
  validFrom: isoDate("2025-01-01"),
  marketValue: money("5000000"),
};
const lease: Lease = {
  id: "l1",
  propertyId: "p1",
  startDate: isoDate("2025-03-01"),
  monthlyRent: money("15000"),
};
const block = portfolio.mortgages.find((m) => m.propertyId === "dubova")!;

beforeEach(() =>
  act(() => {
    usePortfolioStore.setState({
      removeValuation: vi.fn(ok),
      removeLease: vi.fn(ok),
      removeMortgageBlock: vi.fn(ok),
    });
    useUiStore.setState({
      language: "en",
      route: "properties",
      unsavedChanges: false,
      unsavedSources: [],
      pendingLeave: null,
      pendingSource: null,
    });
  }),
);

const cancelButton = () =>
  screen.getByRole("button", { name: en.common.cancel });

/** A write that resolves only when the test says so. */
function deferred() {
  let finish: (r: MutationResult) => void = () => undefined;
  const promise = new Promise<MutationResult>((r) => (finish = r));
  return { promise, finish: (r: MutationResult) => finish(r) };
}

const recordSpecs: FieldSpec[] = [
  { name: "value", label: "Value", kind: "money" },
];
type RecordRow = { id: string; value: string };

function RecordPanel({
  onDelete = ok,
}: {
  onDelete?: (id: string) => Promise<MutationResult>;
}) {
  return (
    <EntityPanel
      title="Rows"
      addLabel="row"
      rows={[
        { id: "a", value: "100" },
        { id: "b", value: "200" },
      ]}
      columns={[{ head: "Value", left: true, cell: (r) => r.value }]}
      specs={recordSpecs}
      draftOf={(r) => ({ value: r ? r.value : "" })}
      build={(v, id): RecordRow => ({ id, value: String(v.value) })}
      onAdd={ok}
      onSave={ok}
      onDelete={onDelete}
    />
  );
}

/** The deactivate confirm opens from a page button; this stands in for it. */
function DeactivateHarness() {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setConfirming(true)}>
        Deactivate
      </button>
      <ActivationBanner
        propertyName="Dubová"
        isActive
        confirmingDeactivate={confirming}
        onConfirmDeactivate={ok}
        onCancelDeactivate={() => setConfirming(false)}
      />
    </>
  );
}

const clickDelete = () =>
  userEvent.click(screen.getByRole("button", { name: en.common.delete }));

describe("a record's delete confirm names the row (ADR 0143)", () => {
  it("valuation: by its start date (#132)", async () => {
    render(<ValuationsPanel propertyId="p1" rows={[valuation]} />);
    await clickDelete();
    expect(
      screen.getByText("Delete the valuation from 01.01.2025?"),
    ).toBeTruthy();
  });

  it("lease: by its start date (#132)", async () => {
    render(<LeasesPanel propertyId="p1" rows={[lease]} />);
    await clickDelete();
    expect(screen.getByText("Delete the lease from 01.03.2025?")).toBeTruthy();
  });

  it("mortgage block: by its start date (#132)", async () => {
    render(<MortgagesPanel propertyId="dubova" rows={[block]} />);
    await clickDelete();
    expect(
      screen.getByText(
        `Delete the mortgage block from ${fmtDate(block.startDate)}?`,
      ),
    ).toBeTruthy();
  });
});

// Focus lands on Cancel, the safe choice: a held Enter on the trigger cannot reach Yes.
describe("focus moves into the confirm row (ADR 0143)", () => {
  it("record panel: onto Cancel, and back to the row's Delete on Cancel (#132)", async () => {
    render(<RecordPanel />);
    const trigger = screen.getAllByRole("button", {
      name: en.common.delete,
    })[1]!;
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("scenario list: onto Cancel (#132)", async () => {
    render(
      <ScenarioListPanel
        scenarios={[{ id: "s1", name: "Rates up", overrides: {} }]}
        baseOn
        onToggleBase={() => undefined}
        selectedIds={[]}
        maxCompare={4}
        onToggle={() => undefined}
        busy={false}
        onEdit={() => undefined}
        onDuplicate={() => undefined}
        onDelete={ok}
      />,
    );
    await clickDelete();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.common.cancel }),
    );
  });

  it("deactivate banner: onto Cancel (#132)", () => {
    render(
      <ActivationBanner
        propertyName="Dubová"
        isActive
        confirmingDeactivate
        onConfirmDeactivate={ok}
        onCancelDeactivate={() => undefined}
      />,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.common.cancel }),
    );
  });
});

describe("the confirm's buttons are described by its question (ADR 0143)", () => {
  // Focus lands on a button, so a screen reader reads the question only through the
  // button's description.
  it("deactivate banner: Yes and Cancel (#132)", () => {
    render(
      <ActivationBanner
        propertyName="Dubová"
        isActive
        confirmingDeactivate
        onConfirmDeactivate={ok}
        onCancelDeactivate={() => undefined}
      />,
    );
    const description = en.propertyDetail.confirmDeactivate("Dubová");
    expect(
      screen.queryByRole("button", {
        name: en.propertyDetail.yesDeactivate,
        description,
      }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: en.common.cancel, description }),
    ).not.toBeNull();
  });
});

describe("a failed scenario delete keeps the row open (ADR 0143)", () => {
  it("shows the reason next to the buttons (#132)", async () => {
    render(
      <ScenarioListPanel
        scenarios={[{ id: "s1", name: "Rates up", overrides: {} }]}
        baseOn
        onToggleBase={() => undefined}
        selectedIds={[]}
        maxCompare={4}
        onToggle={() => undefined}
        busy={false}
        onEdit={() => undefined}
        onDuplicate={() => undefined}
        onDelete={async () => gone}
      />,
    );
    await clickDelete();
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    expect(
      screen.getByText(en.scenarios.confirmDelete("Rates up")),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      en.dataErrors.ROW_MISSING,
    );
  });
});

// #249: today's ConfirmRow behaviour on every caller (ADR 0143), pinned.
describe("ConfirmRow focus on every caller (#249)", () => {
  it("Properties delete: onto Cancel, and back to the row's Delete on Cancel", async () => {
    act(() =>
      usePortfolioStore.setState({ portfolio, assumptions, status: "ready" }),
    );
    render(<Properties />);
    const trigger = screen.getAllByRole("button", {
      name: en.common.delete,
    })[1]!;
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(cancelButton());
    await userEvent.click(cancelButton());
    expect(document.activeElement).toBe(trigger);
  });

  it("scenario list: Cancel puts focus back on the scenario's Delete", async () => {
    render(
      <ScenarioListPanel
        scenarios={[{ id: "s1", name: "Rates up", overrides: {} }]}
        baseOn
        onToggleBase={() => undefined}
        selectedIds={[]}
        maxCompare={4}
        onToggle={() => undefined}
        busy={false}
        onEdit={() => undefined}
        onDuplicate={() => undefined}
        onDelete={ok}
      />,
    );
    const trigger = screen.getByRole("button", { name: en.common.delete });
    await userEvent.click(trigger);
    await userEvent.click(cancelButton());
    expect(document.activeElement).toBe(trigger);
  });

  it("deactivate banner: Cancel puts focus back on the Deactivate button", async () => {
    render(<DeactivateHarness />);
    const trigger = screen.getByRole("button", { name: "Deactivate" });
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(cancelButton());
    await userEvent.click(cancelButton());
    expect(document.activeElement).toBe(trigger);
  });

  it("leave-guard path: Discard opens the confirm with focus on Cancel; Cancel goes back to that row's Delete", async () => {
    const user = userEvent.setup();
    render(
      <>
        <RecordPanel />
        <LeaveGuard />
      </>,
    );
    await user.click(
      screen.getAllByRole("button", { name: en.common.edit })[0]!,
    );
    await user.type(screen.getByRole("textbox", { name: "Value" }), "5");
    const trigger = screen.getAllByRole("button", {
      name: en.common.delete,
    })[1]!;
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: en.common.discardChanges }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(cancelButton());
    await user.click(cancelButton());
    expect(document.activeElement).toBe(trigger);
  });
});

describe("ConfirmRow busy state (#249)", () => {
  it("disables both buttons and shows the busy label while the write runs; a failure enables them again", async () => {
    const write = deferred();
    render(<RecordPanel onDelete={() => write.promise} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: en.common.delete })[0]!,
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    const busy = screen.getByRole<HTMLButtonElement>("button", {
      name: en.common.deleting,
    });
    expect(busy.disabled).toBe(true);
    expect(cancelButton()).toHaveProperty("disabled", true);
    await act(async () => write.finish(gone));
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: en.common.yesDelete,
      }).disabled,
    ).toBe(false);
    expect(cancelButton()).toHaveProperty("disabled", false);
    expect(screen.getByRole("alert").textContent).toBe(
      en.dataErrors.ROW_MISSING,
    );
  });
});
