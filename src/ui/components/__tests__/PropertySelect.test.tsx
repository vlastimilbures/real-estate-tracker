// @vitest-environment jsdom
//
// #128 R5-05 (ADR 0157): past five options the property selector is a listbox popover.
// Opening it moves focus in, the options follow the listbox keyboard pattern (one Tab
// stop, arrows, Home/End, Space and Enter), and Escape puts focus back on the trigger.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertySelect } from "../PropertySelect";
import { useUiStore } from "../../../state/uiStore";
import { getDict } from "../../../i18n";

const en = getDict("en");
const cs = getDict("cs");

const OPTIONS = Array.from({ length: 6 }, (_, i) => ({
  value: `p${i}`,
  label: `Byt ${i}`,
}));

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

function multi(selected: string[] = [], onChange = vi.fn()) {
  render(
    <>
      <PropertySelect
        mode="multi"
        options={OPTIONS}
        allLabel="All"
        selected={selected}
        onChange={onChange}
      />
      <button type="button">Outside</button>
    </>,
  );
  return onChange;
}

function single(selected = "p2", onChange = vi.fn()) {
  render(
    <PropertySelect
      mode="single"
      options={OPTIONS}
      selected={selected}
      onChange={onChange}
      ariaLabel="Entity"
      testId="entity"
    />,
  );
  return onChange;
}

const trigger = () => screen.getByRole("button", { expanded: false });
const option = (name: string) => screen.getByRole("option", { name });

describe("PropertySelect dropdown, multi mode (#128 R5-05)", () => {
  it("moves focus into the list on open", async () => {
    const user = userEvent.setup();
    multi();
    await user.click(screen.getByTestId("dashboard-filter-trigger"));
    expect(screen.getByRole("listbox").contains(document.activeElement)).toBe(
      true,
    );
    expect(document.activeElement).toBe(option("All"));
  });

  it("names the list from the trigger's aria-controls", async () => {
    const user = userEvent.setup();
    multi();
    const t = screen.getByTestId("dashboard-filter-trigger");
    await user.click(t);
    expect(t.getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox").id,
    );
  });

  it("moves with the arrows, Home and End", async () => {
    const user = userEvent.setup();
    multi();
    await user.click(screen.getByTestId("dashboard-filter-trigger"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(option("Byt 0"));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(option("Byt 5"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(option("Byt 5"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(option("All"));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(option("All"));
  });

  it("toggles an option with Space and with Enter", async () => {
    const user = userEvent.setup();
    const onChange = multi();
    await user.click(screen.getByTestId("dashboard-filter-trigger"));
    await user.keyboard("{ArrowDown} ");
    expect(onChange).toHaveBeenLastCalledWith(["p0"]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["p1"]);
  });

  it("has one Tab stop in the list", async () => {
    const user = userEvent.setup();
    multi();
    await user.click(screen.getByTestId("dashboard-filter-trigger"));
    const stops = screen.getAllByRole("option").filter((o) => o.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });

  it("closes on Escape and puts focus back on the trigger", async () => {
    const user = userEvent.setup();
    multi();
    await user.click(screen.getByTestId("dashboard-filter-trigger"));
    act(() => option("Byt 0").focus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByTestId("dashboard-filter-trigger"),
    );
  });

  it("closes when focus leaves the list, without pulling it back", async () => {
    const user = userEvent.setup();
    multi();
    await user.click(screen.getByTestId("dashboard-filter-trigger"));
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Outside" }),
    );
  });

  it("names a multiple selection in the interface language", () => {
    act(() => useUiStore.setState({ language: "cs" }));
    multi(["p0", "p1", "p2"]);
    expect(
      screen.getByTestId("dashboard-filter-trigger").textContent,
    ).toContain(cs.common.nSelected(3));
    expect(cs.common.nSelected(3)).not.toBe(en.common.nSelected(3));
  });
});

describe("PropertySelect dropdown, single mode (#128 R5-05)", () => {
  it("focuses the selected option on open", async () => {
    const user = userEvent.setup();
    single("p2");
    await user.click(trigger());
    expect(document.activeElement).toBe(option("Byt 2"));
  });

  it("selects with Space, closes and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const onChange = single("p2");
    await user.click(trigger());
    await user.keyboard("{ArrowDown} ");
    expect(onChange).toHaveBeenCalledWith("p3");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Entity" }),
    );
  });

  it("closes on Escape and puts focus back on the trigger", async () => {
    const user = userEvent.setup();
    single();
    await user.click(trigger());
    act(() => option("Byt 4").focus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Entity" }),
    );
  });

  it("opens from the trigger with ArrowDown", async () => {
    const user = userEvent.setup();
    single("p2");
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(document.activeElement).toBe(option("Byt 2"));
  });
});
