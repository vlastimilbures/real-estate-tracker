// The editable child-entity panels of Property detail (valuations, leases, mortgage
// blocks): column layout, form specs, draft/build mapping. Each panel reads its own store
// actions.
import { usePortfolioStore } from "../../state/portfolioStore";
import { Money, Pct } from "../components/primitives";
import { EntityPanel, type PanelTable } from "../components/EntityPanel";
import { moneyDraft, dateDraft } from "../model/formParse";
import { fmtDate } from "../../lib/format";
import { CZK } from "../../lib/currency";
import { mortgageFromForm, mortgageSpecs } from "../model/mortgageForm";
import { developmentSummary } from "../model/propertyRecords";
import { MortgageForm } from "./mortgage/MortgageForm";
import type { Valuation, Lease, MortgageBlock } from "../../engine";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";

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
      chrome={{
        title: t.propertyDetail.valuationsTitle,
        info: t.propertyDetail.valuationsHint,
        addLabel: t.propertyDetail.addValuation,
      }}
      table={{
        rows,
        describe: (r) =>
          t.propertyDetail.confirmDeleteValuation(fmtDate(r.validFrom)),
        onDelete: remove,
        columns: [
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
        ],
      }}
      form={{
        specs: [
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
            suffix: CZK.symbol,
          },
        ],
        draftOf: (r) => ({
          validFrom: dateDraft(r?.validFrom),
          validTo: dateDraft(r?.validTo),
          marketValue: moneyDraft(r?.marketValue),
        }),
        build: (v, id) => ({
          id,
          propertyId,
          validFrom: v.validFrom,
          validTo: v.validTo ?? undefined,
          marketValue: v.marketValue,
        }),
        // ADR 0227: the store ends the open-ended valuation before an open-ended new
        // one, without asking.
        onAdd: (v) => add(v),
        onSave: save,
      }}
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
      chrome={{
        title: t.propertyDetail.leasesTitle,
        info: t.propertyDetail.leasesHint,
        addLabel: t.propertyDetail.addLease,
      }}
      table={{
        rows,
        describe: (r) =>
          t.propertyDetail.confirmDeleteLease(fmtDate(r.startDate)),
        onDelete: remove,
        columns: [
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
        ],
      }}
      form={{
        specs: [
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
            suffix: CZK.symbol,
          },
        ],
        draftOf: (r) => ({
          startDate: dateDraft(r?.startDate),
          endDate: dateDraft(r?.endDate),
          monthlyRent: moneyDraft(r?.monthlyRent),
        }),
        build: (v, id) => ({
          id,
          propertyId,
          startDate: v.startDate,
          endDate: v.endDate ?? undefined,
          monthlyRent: v.monthlyRent,
        }),
        // Leases never overlap (ADR 0163): the store ends the open lease before a new
        // one, so there is nothing to ask.
        onAdd: (v) => add(v),
        onSave: save,
      }}
    />
  );
}

/** The mortgage table's columns. */
function mortgageColumns(t: Dictionary): PanelTable<MortgageBlock>["columns"] {
  return [
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
      cell: (r) => developmentSummary(t, r),
    },
  ];
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
  const columns = mortgageColumns(t);
  const describeMortgage = (r: MortgageBlock) =>
    t.propertyDetail.confirmDeleteMortgage(fmtDate(r.startDate));
  return (
    <EntityPanel
      chrome={{
        title: t.propertyDetail.mortgagesTitle,
        info: t.propertyDetail.mortgagesHint,
        addLabel: t.propertyDetail.addMortgage,
      }}
      table={{ rows, describe: describeMortgage, onDelete: remove, columns }}
      form={{
        specs: mortgageSpecs(t),
        build: (v, id) =>
          mortgageFromForm(
            v,
            id,
            propertyId,
            rows.find((r) => r.id === id),
          ),
        onAdd: (v) => add(v),
        onSave: save,
        render: (p) => (
          <MortgageForm {...p} successorNote={p.adding && rows.length > 0} />
        ),
      }}
    />
  );
}
