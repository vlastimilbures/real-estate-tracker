// A second shared fixture: the seed plus a future-dated purchase with a new loan, a
// development loan with draws, and a deactivated property. Used by the invariant and
// property-based suites to exercise the non-seed code paths.
import { isoDate } from "../../dates";
import type { MortgageBlock, Portfolio } from "../../types";
import { portfolio } from "./seed";
import { rate } from "../../brands";
import { money } from "../../brands";

export const devBlock: MortgageBlock = {
  id: "m-dev",
  propertyId: "dev",
  startDate: isoDate("2026-03-01"), // > 1 month before baseDate (avoids DR-016)
  initialPrincipal: money("2000000"),
  fixationYears: 5,
  interestRatePa: rate("0.049"),
  monthlyInstalment: money("11000"),
  loanTermYears: 30,
  draws: [
    { date: isoDate("2026-11-15"), amount: money("1500000") },
    { date: isoDate("2027-08-20"), amount: money("1000000") },
  ],
  completionDate: isoDate("2027-08-20"),
};

export const mixed: Portfolio = {
  properties: [
    ...portfolio.properties,
    {
      id: "future",
      name: "Future buy",
      purchaseDate: isoDate("2028-03-15"),
      purchasePrice: money("6000000"),
    },
    {
      id: "dev",
      name: "Dev unit",
      purchaseDate: isoDate("2026-03-01"),
      purchasePrice: money("7000000"),
    },
    {
      id: "inactive",
      name: "Sold flat",
      purchaseDate: isoDate("2019-05-01"),
      purchasePrice: money("3000000"),
      active: false,
    },
  ],
  mortgages: [
    ...portfolio.mortgages,
    {
      id: "m-future",
      propertyId: "future",
      startDate: isoDate("2028-03-15"),
      initialPrincipal: money("4200000"),
      fixationYears: 5,
      interestRatePa: rate("0.042"),
      monthlyInstalment: money("24000"),
    },
    devBlock,
    {
      id: "m-inactive",
      propertyId: "inactive",
      startDate: isoDate("2019-05-01"),
      initialPrincipal: money("2000000"),
      fixationYears: 5,
      interestRatePa: rate("0.02"),
      monthlyInstalment: money("9000"),
    },
  ],
  valuations: [
    ...portfolio.valuations,
    {
      id: "v-future",
      propertyId: "future",
      validFrom: isoDate("2028-03-01"),
      marketValue: money("6300000"),
    },
    {
      id: "v-dev",
      propertyId: "dev",
      validFrom: isoDate("2026-06-01"),
      marketValue: money("9500000"),
    },
    {
      id: "v-inactive",
      propertyId: "inactive",
      validFrom: isoDate("2026-06-01"),
      marketValue: money("4000000"),
    },
  ],
  leases: [
    ...portfolio.leases,
    {
      id: "l-future",
      propertyId: "future",
      startDate: isoDate("2028-04-01"),
      monthlyRent: money("21000"),
    },
    {
      id: "l-dev",
      propertyId: "dev",
      startDate: isoDate("2027-10-01"),
      monthlyRent: money("26000"),
    },
    {
      id: "l-inactive",
      propertyId: "inactive",
      startDate: isoDate("2020-01-01"),
      monthlyRent: money("15000"),
    },
  ],
  holdingCosts: portfolio.holdingCosts,
};
