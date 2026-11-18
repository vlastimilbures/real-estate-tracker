// @vitest-environment jsdom
//
// ADR 0253 (#444): a row write action is disabled, natively, while any write is queued
// or running, and still when its caller disables it.
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil } from "lucide-react";
import { WriteRowAction } from "../RowActions";
import { usePortfolioStore } from "../../../state/portfolioStore";

const button = () => screen.getByRole("button", { name: "Edit" });
const writes = (n: number) =>
  act(() => usePortfolioStore.setState({ writesRunning: n }));

describe("WriteRowAction (ADR 0253)", () => {
  it("is enabled while no write runs", async () => {
    const onClick = vi.fn();
    render(<WriteRowAction icon={Pencil} label="Edit" onClick={onClick} />);
    expect(button()).toHaveProperty("disabled", false);
    await userEvent.click(button());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled while a write runs, and enabled again after it", async () => {
    const onClick = vi.fn();
    render(<WriteRowAction icon={Pencil} label="Edit" onClick={onClick} />);
    writes(2);
    expect(button()).toHaveProperty("disabled", true);
    await userEvent.click(button());
    expect(onClick).not.toHaveBeenCalled();
    writes(1);
    expect(button()).toHaveProperty("disabled", true);
    writes(0);
    expect(button()).toHaveProperty("disabled", false);
  });

  it("stays disabled by its caller when no write runs", () => {
    render(
      <WriteRowAction icon={Pencil} label="Edit" disabled onClick={vi.fn()} />,
    );
    expect(button()).toHaveProperty("disabled", true);
  });

  it("keeps the row action's look: no aria-disabled, the same class", () => {
    render(<WriteRowAction icon={Pencil} label="Edit" onClick={vi.fn()} />);
    writes(1);
    expect(button().getAttribute("aria-disabled")).toBeNull();
    expect(button().className).toBe("row-action");
  });
});
