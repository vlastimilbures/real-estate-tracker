// @vitest-environment jsdom
//
// #600 (ADR 0157): the native menu's items wait while a modal dialog is open, and only
// then. Pinned for every modal the app has (About, the leave guard, the property and
// scenario forms, the Clear sample confirmation) and for the open layers that are not
// modal (the dropdown's list, the date popover), through the real components.
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { App } from "../App";
import { ClearSampleButton } from "../components/ClearSampleDialog";
import { DateInput } from "../components/DateInput";
import { PropertySelect } from "../components/PropertySelect";
import { ScenarioForm } from "../pages/ScenarioForm";
import { en } from "../../i18n/en";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { assumptions, portfolio } from "../../engine/__tests__/support/seed";

type Handler = (e: { payload: unknown }) => void;
const handlers = vi.hoisted(() => new Map<string, Handler>());
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, h: Handler) => {
    handlers.set(name, h);
    return () => handlers.delete(name);
  }),
}));

function emit(name: string, payload: unknown = null) {
  const h = handlers.get(name);
  if (!h) throw new Error(`no listener for ${name}`);
  act(() => h({ payload }));
}

/** Sends every menu item; true when none of them acted. */
function menuHeld(): boolean {
  const before = useUiStore.getState();
  emit("menu://navigate", "projections");
  emit("menu://settings");
  emit("menu://new-property");
  emit("menu://about");
  const s = useUiStore.getState();
  return (
    s.route === before.route &&
    s.newPropertyRequested === before.newPropertyRequested &&
    s.aboutOpen === before.aboutOpen
  );
}

// Enough options for a dropdown; a few show as pills.
const OPTIONS = ["a", "b", "c", "d", "e", "f"].map((v) => ({
  value: v,
  label: `Flat ${v}`,
}));

async function renderWith(extra: ReactNode = null) {
  render(
    <>
      <App />
      {extra}
    </>,
  );
  await act(async () => {});
}

beforeAll(async () => {
  await import("../components/DateCalendar");
});

beforeEach(() => {
  handlers.clear();
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  act(() => {
    usePortfolioStore.setState({
      status: { kind: "ready" },
      portfolio,
      assumptions,
      error: null,
      init: async () => {},
    } as never);
    useUiStore.setState({
      route: "dashboard",
      aboutOpen: false,
      newPropertyRequested: false,
      pendingLeave: null,
      unsavedChanges: false,
    });
  });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("menu items wait while a modal is open (#600)", () => {
  it("About", async () => {
    act(() => useUiStore.setState({ aboutOpen: true }));
    await renderWith();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(menuHeld()).toBe(true);
  });

  it("the leave guard", async () => {
    act(() => useUiStore.setState({ pendingLeave: () => {} }));
    await renderWith();
    expect(
      screen.getByRole("dialog", { name: en.common.unsavedTitle }),
    ).toBeTruthy();
    expect(menuHeld()).toBe(true);
  });

  it("the property form", async () => {
    await renderWith();
    emit("menu://new-property");
    expect(
      screen.getByRole("dialog", { name: en.propertyForm.addTitle }),
    ).toBeTruthy();
    expect(menuHeld()).toBe(true);
  });

  it("the scenario form", async () => {
    await renderWith(
      <ScenarioForm
        assumptions={assumptions}
        scenario={null}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(menuHeld()).toBe(true);
  });

  it("the Clear sample confirmation", async () => {
    await renderWith(<ClearSampleButton />);
    await userEvent.click(
      screen.getByRole("button", { name: en.sample.clearAction }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(menuHeld()).toBe(true);
  });

  it("and act again once it closes", async () => {
    act(() => useUiStore.setState({ aboutOpen: true }));
    await renderWith();
    act(() => useUiStore.getState().closeAbout());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(menuHeld()).toBe(false);
  });
});

describe("menu items act while a layer that is not modal is open (#600)", () => {
  it("the dropdown's list", async () => {
    await renderWith(
      <PropertySelect
        mode="single"
        options={OPTIONS}
        selected="a"
        onChange={() => {}}
        ariaLabel="Property"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Property/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(menuHeld()).toBe(false);
  });

  it("the date popover", async () => {
    await renderWith(<DateInput value="" onChange={() => {}} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: en.calendar.open }).at(-1)!,
    );
    await screen.findByRole("dialog", { name: en.calendar.open });
    expect(menuHeld()).toBe(false);
  });
});
