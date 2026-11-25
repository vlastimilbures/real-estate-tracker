// @vitest-environment jsdom
//
// ADR 0201 (#380): one rule per button role. Add buttons carry a plus icon and an
// "Add …" label; Cancel in a form or modal is ghost, left of the primary submit; at most
// one primary in the top bar.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyFormModal } from "../PropertyFormModal";
import { ValuationsPanel } from "../../pages/PropertyEntityPanels";
import { PropertyDetail } from "../../pages/PropertyDetail";
import { Scenarios } from "../../pages/Scenarios";
import { LoanEventRows } from "../../pages/mortgage/LoanEventRows";
import { SampleBanner } from "../SampleBanner";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";
import { LANGUAGES } from "../../../i18n/types";
import { en } from "../../../i18n/en";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";

vi.mock("../../pages/ScenarioCompare", () => ({ CompareView: () => null }));

beforeEach(() =>
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
    });
  }),
);

/** The plus icon, not just any icon. */
const hasIcon = (b: HTMLElement) => b.querySelector("svg.lucide-plus") !== null;
const variant = (b: HTMLElement) =>
  ["primary", "ghost", "danger"].find((v) => b.classList.contains(v)) ??
  "default";

describe("Add buttons (ADR 0201 §2–§4)", () => {
  it.each(LANGUAGES.map((l) => l.value))(
    "every Add label in %s starts with the same verb as Add property",
    (lang) => {
      const t = getDict(lang);
      const verb = t.properties.addProperty.split(" ")[0]!;
      for (const label of [
        t.propertyDetail.addValuation,
        t.propertyDetail.addLease,
        t.propertyDetail.addMortgage,
        t.scenarios.addScenario,
        t.propertyDetail.eventAddPrepayment,
        t.propertyDetail.eventAddRecast,
        t.propertyDetail.addTranche,
      ])
        expect(label.startsWith(`${verb} `), label).toBe(true);
    },
  );

  it("a panel's Add is default, small, with a plus icon; its form submits with the same text", async () => {
    const user = userEvent.setup();
    render(<ValuationsPanel propertyId="p1" rows={[]} />);
    const add = screen.getByRole("button", {
      name: en.propertyDetail.addValuation,
    });
    expect(variant(add)).toBe("default");
    expect(add.classList.contains("sm")).toBe(true);
    expect(hasIcon(add)).toBe(true);
    await user.click(add);
    const submit = screen.getByRole("button", {
      name: en.propertyDetail.addValuation,
    });
    expect(submit.getAttribute("type")).toBe("submit");
  });

  it("Scenarios: the page's Add is primary with a plus icon; its dialog is named the same", async () => {
    render(<Scenarios />);
    const add = screen.getByRole("button", { name: en.scenarios.addScenario });
    expect(variant(add)).toBe("primary");
    expect(hasIcon(add)).toBe(true);
    await userEvent.click(add);
    expect(
      screen.getByRole("dialog", { name: en.scenarios.addScenario }),
    ).toBeTruthy();
  });

  it.each(LANGUAGES.map((l) => l.value))(
    "the empty scenario list in %s names the Add scenario button",
    (lang) => {
      const t = getDict(lang);
      expect(t.scenarios.emptyList).toContain(t.scenarios.addScenario);
    },
  );

  it("a row list's Add (prepayments) is small, default, with the plus icon", () => {
    render(
      <LoanEventRows
        kind="prepayments"
        name="prepayments"
        label="Prepayments"
        rows={[]}
        errors={{}}
        onChange={() => undefined}
      />,
    );
    const add = screen.getByRole("button", {
      name: en.propertyDetail.eventAddPrepayment,
    });
    expect(variant(add)).toBe("default");
    expect(add.classList.contains("sm")).toBe(true);
    expect(hasIcon(add)).toBe(true);
  });
});

describe("Cancel and submit (ADR 0201 §1, §5)", () => {
  it("the property modal's Cancel is ghost, left of the primary Save", () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    const cancel = within(dialog).getByRole("button", {
      name: en.common.cancel,
    });
    expect(variant(cancel)).toBe("ghost");
    const submit = dialog.querySelector<HTMLElement>('button[type="submit"]')!;
    expect(variant(submit)).toBe("primary");
    expect(
      cancel.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("one primary in the top bar (ADR 0201 §6)", () => {
  it("an inactive property: Edit property is the one primary; Activate is default", () => {
    const owner = portfolio.properties[0]!;
    act(() => {
      usePortfolioStore.setState({
        portfolio: {
          ...portfolio,
          properties: portfolio.properties.map((p) =>
            p.id === owner.id ? { ...p, active: false } : p,
          ),
        },
      });
      useUiStore.setState({ route: "property", selectedPropertyId: owner.id });
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    try {
      render(<PropertyDetail />);
      const topbar = document.querySelector<HTMLElement>(".topbar")!;
      const primaries = Array.from(
        topbar.querySelectorAll<HTMLElement>(".btn.primary"),
      ).map((b) => b.textContent);
      expect(primaries).toEqual([en.properties.editProperty]);
      expect(
        variant(
          within(topbar).getByRole("button", {
            name: en.propertyDetail.activate,
          }),
        ),
      ).toBe("default");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("one primary per screen region (ADR 0201 §6)", () => {
  it("the sample banner's Clear sample is a default button, not a second primary", () => {
    act(() =>
      usePortfolioStore.setState({
        sample: { active: true, dismissed: false },
      }),
    );
    render(<SampleBanner />);
    const clear = screen.getByRole("button", { name: en.sample.clearAction });
    expect(variant(clear)).toBe("default");
  });
});
