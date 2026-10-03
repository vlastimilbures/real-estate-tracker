// The editable child-entity panels of Property detail (valuations, leases, mortgage
// blocks): column layout, form specs, draft/build mapping. Split out of
// PropertyDetail.tsx (DR-057); each panel reads its own store actions.
import { usePortfolioStore } from "../../state/portfolioStore";
import { Money, Pct } from "../components/primitives";
import { EntityPanel } from "../components/EntityPanel";
import {
  moneyDraft,
  percentDraft,
  dateDraft,
  drawsDraft,
} from "../model/formParse";
import { INT_RANGES } from "../../lib/intRanges";
import { fmtDate, fmtCzk } from "../../lib/format";
import { currencySymbol } from "../../lib/currency";
import {
  suggestedInstalmentHint,
  instalmentFill,
  mortgageFromForm,
} from "../model/mortgageForm";
import { scheduledPrincipal } from "../../engine";
import type { Valuation, Lease, MortgageBlock } from "../../engine";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";

/** Compact development-loan summary for the mortgage table. */
function devSummary(r: MortgageBlock, t: Dictionary): string {
  const parts: string[] = [];
  if (r.draws?.length) {
    // Total scheduled principal = initial drawdown + every later tranche. Surfacing it
    // lets the user sanity-check the loan isn't double-counting the first draw.
    const total = scheduledPrincipal(r);
    parts.push(
      `${t.propertyDetail.draws(r.draws.length)} · Σ ${fmtCzk(total)}`,
    );
  }
  if (r.completionDate)
    parts.push(t.propertyDetail.ioUntil(fmtDate(r.completionDate)));
  return parts.length ? parts.join(" · ") : "—";
}

export function ValuationsPanel({
  propertyId,
  rows,
}: {
  propertyId: string;
  rows: Valuation[];
}) {
  const t = useT();
  const add = usePortfolioStore((s) => s.addValuation);
  const save = usePortfolioStore((s) => s.saveValuation);
  const remove = usePortfolioStore((s) => s.removeValuation);
  return (
    <EntityPanel
      title={t.propertyDetail.valuationsTitle}
      hint={t.propertyDetail.valuationsHint}
      addLabel={t.propertyDetail.addValuation}
      rows={rows}
      columns={[
        {
          head: t.propertyDetail.colValidFrom,
          left: true,
          cell: (r) => fmtDate(r.validFrom),
        },
        {
          head: t.propertyDetail.colValidTo,
          left: true,
          cell: (r) => (r.validTo ? fmtDate(r.validTo) : "—"),
        },
        {
          head: t.propertyDetail.colMarketValue,
          cell: (r) => <Money value={r.marketValue} parens={false} />,
        },
      ]}
      specs={[
        {
          name: "validFrom",
          label: t.propertyDetail.fieldValidFrom,
          kind: "date",
        },
        {
          name: "validTo",
          label: t.propertyDetail.fieldValidTo,
          kind: "date",
          optional: true,
        },
        {
          name: "marketValue",
          label: t.propertyDetail.fieldMarketValue,
          kind: "money",
          suffix: currencySymbol(),
        },
      ]}
      draftOf={(r) => ({
        validFrom: dateDraft(r?.validFrom),
        validTo: dateDraft(r?.validTo),
        marketValue: moneyDraft(r?.marketValue),
      })}
      build={(v, id) => ({
        id,
        propertyId,
        validFrom: v.validFrom,
        validTo: v.validTo ?? undefined,
        marketValue: v.marketValue,
      })}
      onAdd={add}
      onSave={save}
      onDelete={remove}
    />
  );
}

export function LeasesPanel({
  propertyId,
  rows,
}: {
  propertyId: string;
  rows: Lease[];
}) {
  const t = useT();
  const add = usePortfolioStore((s) => s.addLease);
  const save = usePortfolioStore((s) => s.saveLease);
  const remove = usePortfolioStore((s) => s.removeLease);
  return (
    <EntityPanel
      title={t.propertyDetail.leasesTitle}
      hint={t.propertyDetail.leasesHint}
      addLabel={t.propertyDetail.addLease}
      rows={rows}
      columns={[
        {
          head: t.propertyDetail.colStart,
          left: true,
          cell: (r) => fmtDate(r.startDate),
        },
        {
          head: t.propertyDetail.colEnd,
          left: true,
          cell: (r) => (r.endDate ? fmtDate(r.endDate) : "—"),
        },
        {
          head: t.propertyDetail.colMonthlyRent,
          cell: (r) => <Money value={r.monthlyRent} parens={false} />,
        },
      ]}
      specs={[
        {
          name: "startDate",
          label: t.propertyDetail.fieldStartDate,
          kind: "date",
        },
        {
          name: "endDate",
          label: t.propertyDetail.fieldEndDate,
          kind: "date",
          optional: true,
        },
        {
          name: "monthlyRent",
          label: t.propertyDetail.fieldMonthlyRent,
          kind: "money",
          suffix: currencySymbol(),
        },
      ]}
      draftOf={(r) => ({
        startDate: dateDraft(r?.startDate),
        endDate: dateDraft(r?.endDate),
        monthlyRent: moneyDraft(r?.monthlyRent),
      })}
      build={(v, id) => ({
        id,
        propertyId,
        startDate: v.startDate,
        endDate: v.endDate ?? undefined,
        monthlyRent: v.monthlyRent,
      })}
      onAdd={add}
      onSave={save}
      onDelete={remove}
    />
  );
}

export function MortgagesPanel({
  propertyId,
  rows,
}: {
  propertyId: string;
  rows: MortgageBlock[];
}) {
  const t = useT();
  const add = usePortfolioStore((s) => s.addMortgageBlock);
  const save = usePortfolioStore((s) => s.saveMortgageBlock);
  const remove = usePortfolioStore((s) => s.removeMortgageBlock);
  return (
    <EntityPanel
      title={t.propertyDetail.mortgagesTitle}
      hint={t.propertyDetail.mortgagesHint}
      addLabel={t.propertyDetail.addMortgage}
      rows={rows}
      columns={[
        {
          head: t.propertyDetail.colStart,
          left: true,
          cell: (r) => fmtDate(r.startDate),
        },
        {
          head: t.propertyDetail.colInitialPrincipal,
          cell: (r) => <Money value={r.initialPrincipal} parens={false} />,
        },
        {
          head: t.propertyDetail.colFixation,
          cell: (r) => t.propertyDetail.yrs(r.fixationYears),
        },
        {
          head: t.propertyDetail.colTerm,
          cell: (r) =>
            r.loanTermYears != null
              ? t.propertyDetail.yrs(r.loanTermYears)
              : t.propertyDetail.auto,
        },
        {
          head: t.propertyDetail.colRate,
          cell: (r) => <Pct value={r.interestRatePa} dp={2} />,
        },
        {
          head: t.propertyDetail.colInstalment,
          cell: (r) => <Money value={r.monthlyInstalment} parens={false} />,
        },
        {
          head: t.propertyDetail.colDevelopment,
          left: true,
          cell: (r) => devSummary(r, t),
        },
      ]}
      specs={[
        {
          name: "startDate",
          label: t.propertyDetail.fieldStartDate,
          kind: "date",
        },
        {
          name: "initialPrincipal",
          label: t.propertyDetail.fieldInitialPrincipal,
          kind: "money",
          suffix: currencySymbol(),
        },
        {
          name: "fixationYears",
          label: t.propertyDetail.fieldFixationYears,
          kind: "int",
          suffix: t.common.yearsSuffix,
          range: INT_RANGES.fixationYears,
        },
        {
          name: "loanTermYears",
          label: t.propertyDetail.fieldLoanTermYears,
          kind: "int",
          suffix: t.common.yearsSuffix,
          range: INT_RANGES.loanTermYears,
          optional: true,
          help: t.propertyDetail.helpLoanTermYears,
        },
        {
          name: "interestRatePa",
          label: t.propertyDetail.fieldInterestRate,
          kind: "pct",
          suffix: "%",
        },
        {
          name: "monthlyInstalment",
          label: t.propertyDetail.fieldMonthlyInstalment,
          kind: "money",
          suffix: currencySymbol(),
        },
        {
          name: "draws",
          label: t.propertyDetail.fieldDraws,
          kind: "draws",
          optional: true,
          help: t.propertyDetail.helpDraws,
        },
        {
          name: "completionDate",
          label: t.propertyDetail.fieldCompletionDate,
          kind: "date",
          optional: true,
          help: t.propertyDetail.helpCompletionDate,
        },
        {
          name: "contractMaturityDate",
          label: t.propertyDetail.fieldContractMaturity,
          kind: "date",
          optional: true,
          help: t.propertyDetail.helpContractMaturity,
        },
      ]}
      draftOf={(r) => ({
        startDate: dateDraft(r?.startDate),
        initialPrincipal: moneyDraft(r?.initialPrincipal),
        fixationYears: r ? String(r.fixationYears) : "",
        loanTermYears: r?.loanTermYears != null ? String(r.loanTermYears) : "",
        interestRatePa: percentDraft(r?.interestRatePa),
        monthlyInstalment: moneyDraft(r?.monthlyInstalment),
        draws: drawsDraft(r?.draws),
        completionDate: dateDraft(r?.completionDate),
        contractMaturityDate: dateDraft(r?.contractMaturityDate),
      })}
      build={(v, id) =>
        mortgageFromForm(
          v,
          id,
          propertyId,
          rows.find((r) => r.id === id),
        )
      }
      onAdd={add}
      onSave={save}
      onDelete={remove}
      computeHint={(draft) => suggestedInstalmentHint(t, draft)}
      fieldActions={{ monthlyInstalment: (draft) => instalmentFill(t, draft) }}
    />
  );
}
