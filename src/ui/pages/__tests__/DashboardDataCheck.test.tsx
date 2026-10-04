// @vitest-environment jsdom
//
// ADR 0118 (#35): the Dashboard "Data check" panel.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { edate, type Portfolio } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { DataCheckPanel } from "../DashboardDataCheck";

const d = en.dataCheck;

function renderPanel(p: Portfolio, asOf: Date = BASE_DATE) {
  const onFix = vi.fn();
  render(
    <DataCheckPanel
      portfolio={p}
      asOf={asOf}
      resetRate={assumptions.postFixationResetRatePa}
      onFix={onFix}
    />,
  );
  return { onFix };
}

const toggle = () => screen.getByRole("button", { name: /data check/i });

beforeEach(() =>
  act(() => useUiStore.setState({ language: "en", dataCheckOpen: null })),
);

describe("Data check panel (ADR 0118)", () => {
  it("only defaults: collapsed, with the counts and the as-of date", () => {
    renderPanel(portfolio);
    expect(screen.getByText(d.title)).toBeTruthy();
    expect(screen.getByText(d.summary(0, 3))).toBeTruthy();
    expect(screen.getByText("Checked as of 07.06.2026.")).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(d.attentionTitle)).toBeNull();
  });

  it("something needs attention: open, each row named and linked to its fix", async () => {
    const { onFix } = renderPanel(portfolio, edate(BASE_DATE, 60));
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(d.summary(6, 3))).toBeTruthy();
    expect(screen.getByText(d.attentionTitle)).toBeTruthy();
    expect(screen.getByText(d.defaultsTitle)).toBeTruthy();
    expect(screen.getAllByText("Byt Lipova:")).toHaveLength(3);
    const records = screen.getAllByRole("button", { name: "Go to Records" });
    expect(records).toHaveLength(3);
    await userEvent.click(records[1]);
    expect(onFix).toHaveBeenCalledWith("lipova", "records");
    const financing = screen.getAllByRole("button", {
      name: "Go to Financing",
    });
    await userEvent.click(financing[2]);
    expect(onFix).toHaveBeenLastCalledWith("dubova", "financing");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Edit property" })[0],
    );
    expect(onFix).toHaveBeenLastCalledWith("javorova", "edit");
  });

  it("a manual Show / Hide wins for the session", async () => {
    renderPanel(portfolio);
    await userEvent.click(toggle());
    expect(useUiStore.getState().dataCheckOpen).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(d.attentionNone)).toBeTruthy();
    expect(screen.getAllByText(d.growthBoth)).toHaveLength(3);
    await userEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves out inactive properties, as the Dashboard's totals do", () => {
    renderPanel(
      {
        ...portfolio,
        properties: portfolio.properties.map((p) =>
          p.id === "dubova" ? { ...p, active: false } : p,
        ),
      },
      edate(BASE_DATE, 60),
    );
    expect(screen.getByText(d.summary(4, 2))).toBeTruthy();
    expect(screen.queryByText("Byt Dubova:")).toBeNull();
  });

  it("no finding: no toggle, nothing needs attention", () => {
    const own: Portfolio = {
      ...portfolio,
      properties: portfolio.properties.map((p) => ({
        ...p,
        appreciationOverridePa: assumptions.appreciationPa,
        rentIndexOverridePa: assumptions.rentIndexationPa,
      })),
    };
    renderPanel(own);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(d.attentionNone)).toBeTruthy();
    expect(screen.getByText(d.summary(0, 0))).toBeTruthy();
  });
});
