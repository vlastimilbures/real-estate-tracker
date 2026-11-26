// @vitest-environment jsdom
//
// The Properties table, rows and totals row, pinned whole on the sample and on a portfolio
// with a pending purchase, a development loan and an inactive property, so changing how
// its model functions take their arguments cannot change a cell.
import { beforeEach, describe, expect, it } from "vitest";
import { Properties } from "../Properties";
import { portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import type { Portfolio } from "../../../engine";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { setClock } from "../../../__tests__/support/clock";

beforeEach(() => setClock("2026-10-01"));

const tableOf = (p: Portfolio) => {
  const { container } = renderWithPortfolio(<Properties />, {
    portfolio: p,
    route: "properties",
  });
  return container
    .querySelector("table")!
    .outerHTML.replace(/«[^»]+»|:r[0-9a-z]+:/g, "«id»");
};

describe("the Properties table", () => {
  it("on the sample", () => {
    expect(tableOf(portfolio)).toMatchSnapshot();
  });

  it("with a pending, a developing and an inactive property", () => {
    expect(tableOf(mixed)).toMatchSnapshot();
  });
});
