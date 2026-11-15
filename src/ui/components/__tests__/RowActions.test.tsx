// @vitest-environment jsdom
//
// ADR 0199 (#374): one icon-only style for row actions. The button's name is its text,
// which is also the tooltip shown on hover and keyboard focus; Escape hides the tooltip
// without moving focus (WCAG 1.4.13) and stops there only while it shows.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil, Trash2 } from "lucide-react";
import { RowAction, RowActions } from "../RowActions";

function renderPair(onEdit = vi.fn(), onDelete = vi.fn()) {
  return render(
    <RowActions>
      <RowAction icon={Pencil} label="Edit" onClick={onEdit} />
      <RowAction icon={Trash2} label="Delete" danger onClick={onDelete} />
    </RowActions>,
  );
}

describe("RowAction (ADR 0199)", () => {
  it("is an icon button named by its label, which is the tooltip", () => {
    renderPair();
    const edit = screen.getByRole("button", { name: "Edit" });
    expect(edit.getAttribute("type")).toBe("button");
    expect(edit.classList.contains("row-action")).toBe(true);
    expect(edit.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(edit.querySelector(".row-action-tip")?.textContent).toBe("Edit");
    expect(edit.hasAttribute("title")).toBe(false);
  });

  it("marks Delete as destructive, and the group as row actions", () => {
    const { container } = renderPair();
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del.classList.contains("danger")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Edit" }).classList.contains("danger"),
    ).toBe(false);
    expect(container.firstElementChild?.className).toBe("row-actions");
  });

  it("runs its action on click, and not while disabled", async () => {
    const onEdit = vi.fn();
    const { rerender } = render(
      <RowAction icon={Pencil} label="Edit" onClick={onEdit} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledOnce();
    rerender(
      <RowAction icon={Pencil} label="Edit" onClick={onEdit} disabled />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("Escape hides the tooltip, keeps focus, and stops only the first Escape", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === "Escape" && outer()}>
        <RowAction icon={Pencil} label="Edit" onClick={vi.fn()} />
      </div>,
    );
    const edit = screen.getByRole("button", { name: "Edit" });
    edit.focus();
    fireEvent.keyDown(edit, { key: "Escape" });
    expect(edit.classList.contains("tip-off")).toBe(true);
    expect(document.activeElement).toBe(edit);
    expect(outer).not.toHaveBeenCalled();
    // The tooltip is already hidden: the next Escape reaches the dialog or form.
    fireEvent.keyDown(edit, { key: "Escape" });
    expect(outer).toHaveBeenCalledOnce();
    // Leaving the button lets the tooltip show again next time.
    fireEvent.blur(edit);
    expect(edit.classList.contains("tip-off")).toBe(false);
  });

  it("the name survives the tooltip being hidden", () => {
    renderPair();
    const edit = screen.getByRole("button", { name: "Edit" });
    fireEvent.keyDown(edit, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Edit" })).toBe(edit);
  });
});
