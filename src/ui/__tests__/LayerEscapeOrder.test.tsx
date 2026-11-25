// @vitest-environment jsdom
//
// #491: which layer one Escape closes, for every nesting the app has (ADR 0157, ADR 0173,
// ADR 0199, ADR 0217). Pinned before the layers moved onto one dismiss hook, so the move
// keeps today's order: a date popover, a focused or hovered info tip, the dropdown and a
// hovered row-action tooltip each take the first Escape inside a dialog; a tip that is only
// pinned lets it through to the dialog. Also pins that the date popover is not counted as
// an open layer.
import { describe, it, expect, beforeAll, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil } from "lucide-react";
import { Modal } from "../components/Modal";
import { DateInput } from "../components/DateInput";
import { InfoTip } from "../components/InfoTip";
import { PropertySelect } from "../components/PropertySelect";
import { RowAction } from "../components/RowActions";
import { anyOpen as layerOpen } from "../layers";
import { en } from "../../i18n/en";

beforeAll(async () => {
  await import("../components/DateCalendar");
});

const OPTIONS = ["a", "b", "c", "d", "e", "f"].map((v) => ({
  value: v,
  label: `Flat ${v}`,
}));

function InDialog({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal titleId="t" title="Dialog" onClose={onClose} closeLabel="Close">
      <button type="button">First</button>
      {children}
    </Modal>
  );
}

const escape = (el: Element = document.activeElement ?? document.body) =>
  fireEvent.keyDown(el, { key: "Escape" });
const calendar = () => screen.queryByRole("dialog", { name: en.calendar.open });
const tipButton = () =>
  screen.getByRole("button", { name: `${en.common.aboutThis}: Topic` });

describe("one Escape closes one layer inside a dialog (#491)", () => {
  it("an open date popover closes first, focus back on its trigger; the next Escape closes the dialog", async () => {
    const onClose = vi.fn();
    render(
      <InDialog onClose={onClose}>
        <DateInput value="" onChange={() => {}} />
      </InDialog>,
    );
    const trigger = screen.getByRole("button", { name: en.calendar.open });
    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: en.calendar.open });
    escape();
    expect(calendar()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a focused info tip closes first; the next Escape closes the dialog", async () => {
    const onClose = vi.fn();
    render(
      <InDialog onClose={onClose}>
        <InfoTip topic="Topic">Why.</InfoTip>
      </InDialog>,
    );
    act(() => tipButton().focus());
    expect(tipButton().getAttribute("aria-expanded")).toBe("true");
    escape();
    expect(tipButton().getAttribute("aria-expanded")).toBe("false");
    expect(onClose).not.toHaveBeenCalled();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a hovered info tip closes first, although focus is elsewhere in the dialog", () => {
    const onClose = vi.fn();
    render(
      <InDialog onClose={onClose}>
        <InfoTip topic="Topic">Why.</InfoTip>
      </InDialog>,
    );
    fireEvent.mouseEnter(tipButton().parentElement!);
    expect(tipButton().getAttribute("aria-expanded")).toBe("true");
    escape(screen.getByRole("button", { name: "First" }));
    expect(tipButton().getAttribute("aria-expanded")).toBe("false");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a tip that is only pinned closes and lets the same Escape close the dialog", () => {
    const onClose = vi.fn();
    render(
      <InDialog onClose={onClose}>
        <InfoTip topic="Topic">Why.</InfoTip>
      </InDialog>,
    );
    // A click that does not focus the button (WebKit) and a pointer that has left.
    fireEvent.click(tipButton());
    expect(tipButton().getAttribute("aria-expanded")).toBe("true");
    escape(screen.getByRole("button", { name: "First" }));
    expect(tipButton().getAttribute("aria-expanded")).toBe("false");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the dropdown's list closes first, focus back on its trigger; the next Escape closes the dialog", async () => {
    const onClose = vi.fn();
    render(
      <InDialog onClose={onClose}>
        <PropertySelect
          mode="single"
          options={OPTIONS}
          selected="a"
          onChange={() => {}}
          ariaLabel="Property"
        />
      </InDialog>,
    );
    const trigger = screen.getByRole("button", { name: /Property/ });
    await userEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(layerOpen()).toBe(true);
    escape();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a hovered row action's tooltip hides first; the next Escape closes the dialog", () => {
    const onClose = vi.fn();
    render(
      <InDialog onClose={onClose}>
        <RowAction icon={Pencil} label="Edit" onClick={() => {}} />
      </InDialog>,
    );
    const action = screen.getByRole("button", { name: "Edit" });
    fireEvent.mouseEnter(action);
    escape(screen.getByRole("button", { name: "First" }));
    expect(action.classList.contains("tip-off")).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    escape(screen.getByRole("button", { name: "First" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("open layers (#491)", () => {
  it("a dialog counts as an open layer, and stops counting once it closes", () => {
    const { unmount } = render(
      <InDialog onClose={() => {}}>
        <span />
      </InDialog>,
    );
    expect(layerOpen()).toBe(true);
    unmount();
    expect(layerOpen()).toBe(false);
  });

  it("an open date popover does not count as an open layer", async () => {
    render(<DateInput value="" onChange={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: en.calendar.open }),
    );
    await screen.findByRole("dialog", { name: en.calendar.open });
    expect(layerOpen()).toBe(false);
  });

  it("an info tip or a row-action tooltip does not count as an open layer", () => {
    render(
      <>
        <InfoTip topic="Topic">Why.</InfoTip>
        <RowAction icon={Pencil} label="Edit" onClick={() => {}} />
      </>,
    );
    fireEvent.click(tipButton());
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Edit" }));
    expect(tipButton().getAttribute("aria-expanded")).toBe("true");
    expect(layerOpen()).toBe(false);
  });
});

describe("outside presses (#491)", () => {
  it("a press outside closes the date popover without moving focus", async () => {
    render(
      <>
        <DateInput value="" onChange={() => {}} />
        <button type="button">Elsewhere</button>
      </>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: en.calendar.open }),
    );
    await screen.findByRole("dialog", { name: en.calendar.open });
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    await userEvent.click(elsewhere);
    expect(calendar()).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("a press inside the open calendar keeps it open", async () => {
    render(<DateInput value="" onChange={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: en.calendar.open }),
    );
    const pop = await screen.findByRole("dialog", { name: en.calendar.open });
    fireEvent.mouseDown(pop);
    expect(calendar()).not.toBeNull();
  });

  it("a press outside closes the dropdown's list and leaves focus where it went", async () => {
    render(
      <>
        <PropertySelect
          mode="single"
          options={OPTIONS}
          selected="a"
          onChange={() => {}}
          ariaLabel="Property"
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Property/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    await userEvent.click(elsewhere);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("a press outside closes a pinned info tip, by pointerdown or by mousedown alone", () => {
    render(
      <>
        <InfoTip topic="Topic">Why.</InfoTip>
        <button type="button">Elsewhere</button>
      </>,
    );
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    fireEvent.click(tipButton());
    fireEvent.pointerDown(elsewhere);
    expect(tipButton().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(tipButton());
    expect(tipButton().getAttribute("aria-expanded")).toBe("true");
    fireEvent.mouseDown(elsewhere);
    expect(tipButton().getAttribute("aria-expanded")).toBe("false");
  });
});
