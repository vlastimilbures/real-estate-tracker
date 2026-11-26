// @vitest-environment jsdom
//
// The Properties subtitle and its basis on different days, pinned whole before the as-of
// helpers take their dates as one object: at the base date, within the first half year,
// and on days that round to a projection year.
import { describe, expect, it } from "vitest";
import { usePropertiesTable } from "../usePropertiesTable";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { setClock } from "../../../__tests__/support/clock";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import type { Portfolio } from "../../../engine";

function Probe() {
  const { subtitle, total, rows } = usePropertiesTable();
  return (
    <output>
      {JSON.stringify({
        subtitle,
        total: total?.label ?? null,
        owned: rows.map((r) => `${r.propertyId}:${String(r.owned)}`),
      })}
    </output>
  );
}

const readAt = (day: string, p: Portfolio) => {
  setClock(day);
  const { container, unmount } = renderWithPortfolio(<Probe />, {
    portfolio: p,
    route: "properties",
  });
  const text = container.textContent ?? "";
  unmount();
  return JSON.parse(text) as unknown;
};

describe("the Properties subtitle by day", () => {
  const days = [
    "2026-06-07",
    "2026-10-01",
    "2027-06-07",
    "2031-06-20",
    "2040-01-15",
  ];
  for (const [name, p] of [
    ["sample", portfolio],
    ["mixed", mixed],
  ] as const)
    it(name, () => {
      expect(days.map((d) => [d, readAt(d, p)])).toMatchSnapshot();
    });
});
