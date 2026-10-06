// @vitest-environment jsdom
//
// ADR 0143 (#132 R5-08): an inline destructive confirm names the record, moves focus to
// its confirm button (and back to the trigger on Cancel), and stays open with the reason
// when the write fails.
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
import { EntityPanel } from "../../components/EntityPanel";
import { usePortfolioStore } from "../../../state/portfolioStore";
import type { MutationResult } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { fmtDate } from "../../../lib/format";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { isoDate, money, type Lease, type Valuation } from "../../../engine";
import type { FieldSpec } from "../../model/formParse";

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
    useUiStore.setState({ language: "en" });
  }),
);

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

describe("focus moves into the confirm row (ADR 0143)", () => {
  const specs: FieldSpec[] = [{ name: "value", label: "Value", kind: "money" }];
  type Row = { id: string; value: string };

  it("record panel: onto Yes, and back to the row's Delete on Cancel (#132)", async () => {
    render(
      <EntityPanel
        title="Rows"
        addLabel="row"
        rows={[
          { id: "a", value: "100" },
          { id: "b", value: "200" },
        ]}
        columns={[{ head: "Value", left: true, cell: (r) => r.value }]}
        specs={specs}
        draftOf={(r) => ({ value: r ? r.value : "" })}
        build={(v, id): Row => ({ id, value: String(v.value) })}
        onAdd={ok}
        onSave={ok}
        onDelete={ok}
      />,
    );
    const trigger = screen.getAllByRole("button", {
      name: en.common.delete,
    })[1]!;
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.common.cancel }),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("scenario list: onto Yes, delete (#132)", async () => {
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
      screen.getByRole("button", { name: en.common.yesDelete }),
    );
  });

  it("deactivate banner: onto Yes, deactivate (#132)", () => {
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
      screen.getByRole("button", { name: en.propertyDetail.yesDeactivate }),
    );
  });
});

describe("the confirm's buttons are described by its question (ADR 0143)", () => {
  // Focus lands on a button, so a screen reader reads the question only through the
  // button's description.
  it.fails("deactivate banner: Yes and Cancel (#132)", () => {
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
