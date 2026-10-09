// Presentational panels extracted from PropertyDetail.tsx: the snapshot KPI tiles +
// mini charts, and the always-editable holding-costs form. Pure rendering — the finance
// lives in the engine; these take already-computed props / store actions.
import type { ReactNode } from "react";
import { MetricLabel } from "../components/MetricLabel";
import {
  KpiTile,
  Panel,
  Badge,
  Money,
  Pct,
  Dscr,
  TableWrap,
  StatList,
} from "../components/primitives";
import { ChartCard, CzkLines, SignedBars } from "../components/charts";
import { SERIES, type ChartRow } from "../model/chartData";
import { RecordForm } from "../components/forms";
import { ConfirmRow } from "../components/EntityPanelParts";
import { moneyDraft, percentDraft } from "../model/formParse";
import { fmtDate } from "../../lib/format";
import { amortizationExtras, type LoanOutlook } from "../model/propertyDetail";
import type { AcquisitionView } from "../model/acquisition";
import { dscrBadge, ltvBadge } from "../model/health";
import { currencySymbol } from "../../lib/currency";
import type {
  PropertySnapshot,
  HoldingCost,
  AmortizationRow,
} from "../../engine";
import type { MutationResult } from "../../state/portfolioStore";
import type { Decimal } from "../../lib/money";
import { useT } from "../hooks/useT";

const newId = () => crypto.randomUUID();

/** What a not-yet-owned property will be bought for (ADR 0156). */
export interface NotOwned {
  purchaseDate: Date;
  price: Decimal;
  /** The acquisition loan; null when there is none. */
  loan: Decimal | null;
}

/**
 * Snapshot KPI tiles (value / debt / equity / DSCR) + the two mini charts. A property not
 * owned yet on the date has no snapshot figures: a short purchase panel takes the tiles'
 * place, and the charts stay (ADR 0156).
 */
export function PropertySnapshotTiles({
  s,
  chartRows,
  modeWord,
  purchase,
}: {
  s: PropertySnapshot;
  chartRows: ChartRow[];
  modeWord: string;
  /** Shown instead of the tiles while `s` is not owned. */
  purchase?: NotOwned | undefined;
}) {
  const t = useT();
  const pd = t.propertyDetail;
  const valueSeries = [
    { key: "value", name: pd.seriesValue, color: SERIES.petrol },
    { key: "balance", name: pd.seriesDebt, color: SERIES.clay },
    { key: "equity", name: pd.seriesEquity, color: SERIES.brass },
  ];
  const cashFlowSeries = [
    { key: "netCashFlow", name: pd.seriesNetCashFlow, color: SERIES.positive },
  ];
  return (
    <>
      {!s.owned && purchase ? (
        <NotOwnedPanel {...purchase} />
      ) : (
        <SnapshotTiles s={s} />
      )}

      <div className="chart-grid">
        <ChartCard
          title={t.propertyDetail.chartValueVsDebtVsEquity}
          sub={t.propertyDetail.subMKcMode(modeWord)}
          kind="czk"
          rows={chartRows}
          series={valueSeries}
        >
          <CzkLines data={chartRows} series={valueSeries} />
        </ChartCard>
        <ChartCard
          title={t.propertyDetail.chartNetCashFlowByYear}
          sub={t.propertyDetail.subMKcMode(modeWord)}
          kind="czk"
          rows={chartRows}
          series={cashFlowSeries}
        >
          <SignedBars
            data={chartRows}
            dataKey="netCashFlow"
            name={t.propertyDetail.seriesNetCashFlow}
          />
        </ChartCard>
      </div>
    </>
  );
}

/** A property not owned yet: when it is bought, for how much, with what loan (ADR 0156). */
function NotOwnedPanel({ purchaseDate, price, loan }: NotOwned) {
  const t = useT();
  const d = t.propertyDetail;
  return (
    <Panel title={d.notOwnedTitle} hint={d.notOwnedHint}>
      <StatList
        rows={[
          { k: t.propertyForm.purchaseDate, v: fmtDate(purchaseDate) },
          { k: d.acqPrice, v: <Money value={price} parens={false} /> },
          {
            k: d.acqLoan,
            v: loan ? <Money value={loan} parens={false} /> : d.acqLoanNone,
          },
        ]}
      />
    </Panel>
  );
}

/** The four snapshot KPI tiles of an owned property. */
function SnapshotTiles({ s }: { s: PropertySnapshot }) {
  const t = useT();
  return (
    <div className="tiles">
      <KpiTile
        label={t.propertyDetail.marketValue}
        value={<Money value={s.value} parens={false} suffix={false} />}
      />
      <KpiTile
        label={t.propertyDetail.debt}
        value={<Money value={s.debt} parens={false} suffix={false} />}
        foot={
          <>
            <MetricLabel term="ltv">{t.propertyDetail.ltv}</MetricLabel>{" "}
            <Pct value={s.ltv} />
          </>
        }
        badge={ltvBadge(t, s.ltv)}
      />
      <KpiTile
        label={t.propertyDetail.equity}
        value={<Money value={s.equity} parens={false} suffix={false} />}
      />
      <KpiTile
        label={<MetricLabel term="dscr">{t.propertyDetail.dscr}</MetricLabel>}
        value={s.dscr ? <Dscr value={s.dscr} /> : "—"}
        badge={dscrBadge(t, s.dscr)}
        foot={
          <>
            {t.propertyDetail.netCf} <Money value={s.netCashFlow} signed />
          </>
        }
      />
    </div>
  );
}

/** Holding costs — single row, always editable; blanks fall back to defaults. */
export function HoldingCostsPanel({
  holding,
  propertyId,
  onSave,
  onSaved,
}: {
  holding: HoldingCost | undefined;
  propertyId: string;
  onSave: (h: HoldingCost) => Promise<MutationResult>;
  onSaved: () => void;
}) {
  const t = useT();
  return (
    <Panel
      title={t.propertyDetail.holdingCostsTitle}
      hint={t.propertyDetail.holdingCostsHint}
    >
      <RecordForm
        specs={[
          {
            name: "propertyTaxYr",
            label: t.propertyDetail.fieldPropertyTax,
            kind: "money",
            suffix: currencySymbol(),
            optional: true,
          },
          {
            name: "insuranceYr",
            label: t.propertyDetail.fieldInsurance,
            kind: "money",
            suffix: currencySymbol(),
            optional: true,
          },
          {
            name: "svjMonthly",
            label: t.propertyDetail.fieldSvjMo,
            kind: "money",
            suffix: currencySymbol(),
            optional: true,
          },
          {
            name: "otherYr",
            label: t.propertyDetail.fieldOther,
            kind: "money",
            suffix: currencySymbol(),
            optional: true,
          },
          {
            name: "mgmtPctRent",
            label: t.propertyDetail.fieldMgmtPct,
            kind: "pct",
            suffix: "%",
            optional: true,
          },
          {
            name: "maintPctRent",
            label: t.propertyDetail.fieldMaintPct,
            kind: "pct",
            suffix: "%",
            optional: true,
          },
        ]}
        initial={{
          propertyTaxYr: moneyDraft(holding?.propertyTaxYr),
          insuranceYr: moneyDraft(holding?.insuranceYr),
          svjMonthly: moneyDraft(holding?.svjMonthly),
          otherYr: moneyDraft(holding?.otherYr),
          mgmtPctRent: percentDraft(holding?.mgmtPctRent),
          maintPctRent: percentDraft(holding?.maintPctRent),
        }}
        submitLabel={t.propertyDetail.saveHoldingCosts}
        onSubmit={async (v) => {
          const next: HoldingCost = {
            id: holding?.id ?? newId(),
            propertyId,
            propertyTaxYr: v.propertyTaxYr ?? undefined,
            insuranceYr: v.insuranceYr ?? undefined,
            svjMonthly: v.svjMonthly ?? undefined,
            otherYr: v.otherYr ?? undefined,
            mgmtPctRent: v.mgmtPctRent ?? undefined,
            maintPctRent: v.maintPctRent ?? undefined,
          };
          const res = await onSave(next);
          if (!res.ok) return res.error;
          onSaved();
          return undefined;
        }}
      />
    </Panel>
  );
}

/**
 * Deactivate-confirm and inactive-status banners are mutually exclusive (only one shows
 * at a time), so they're merged into one component rather than two separate conditionals.
 */
export function ActivationBanner({
  propertyName,
  isActive,
  confirmingDeactivate,
  onConfirmDeactivate,
  onCancelDeactivate,
  error,
}: {
  propertyName: string;
  isActive: boolean;
  confirmingDeactivate: boolean;
  /** Deactivates; the confirm stays open with the reason when it fails (UX-050). */
  onConfirmDeactivate: () => Promise<MutationResult>;
  onCancelDeactivate: () => void;
  /** Why the last activation failed, shown in the inactive banner (UX-050). */
  error?: string | null;
}) {
  const t = useT();

  if (confirmingDeactivate) {
    return (
      <Panel flush>
        <ConfirmRow
          message={t.propertyDetail.confirmDeactivate(propertyName)}
          confirmLabel={t.propertyDetail.yesDeactivate}
          busyLabel={t.propertyDetail.deactivating}
          onConfirm={onConfirmDeactivate}
          onCancel={onCancelDeactivate}
        />
      </Panel>
    );
  }

  if (!isActive) {
    return (
      <Panel>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--s2)",
          }}
        >
          <Badge band="neutral">{t.propertyDetail.inactiveBadge}</Badge>
          <span>{t.propertyDetail.inactiveNote}</span>
          {/* The page still runs its own figures: a preview before reactivating (ADR 0155). */}
          <span>{t.propertyDetail.inactivePreviewNote}</span>
        </span>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </Panel>
    );
  }

  return null;
}

/**
 * The loan's modelled payoff, remaining term and the interest its prepayments save
 * (ADR 0116 §9), then each block's fixation end and balance at reset (ADR 0117).
 */
export function LoanSummary({ outlook }: { outlook: LoanOutlook }) {
  const t = useT();
  const d = t.propertyDetail;
  const rows: { k: string; v: ReactNode }[] = [
    { k: d.loanPayoff, v: outlook.payoff },
  ];
  if (outlook.remainingTerm)
    rows.push({ k: d.remainingTerm, v: outlook.remainingTerm });
  if (outlook.interestSaved)
    rows.push({
      k: d.interestSaved,
      v:
        outlook.interestSaved === "n/a" ? (
          d.interestSavedNa
        ) : (
          <Money value={outlook.interestSaved} parens={false} />
        ),
    });
  return (
    <Panel title={d.loanSummaryTitle} hint={d.loanSummaryHint}>
      <StatList rows={rows} />
      <TableWrap label={d.outlookResetsTitle}>
        <table className="data">
          <caption className="sr-only">{d.outlookResetsTitle}</caption>
          <thead>
            <tr>
              <th scope="col" className="left">
                {d.colStart}
              </th>
              <th scope="col" className="left">
                {d.colFixationEnd}
              </th>
              <th scope="col">{d.colBalanceAtReset}</th>
              <th scope="col" className="left">
                {d.colStatus}
              </th>
            </tr>
          </thead>
          <tbody>
            {outlook.resets.map((r) => (
              <tr
                key={r.blockId}
                className={r.status === "nextReset" ? "is-milestone" : ""}
              >
                <td className="left">{r.start}</td>
                <td className="left">{r.fixationEnd}</td>
                <td>
                  {r.balance ? <Money value={r.balance} parens={false} /> : "—"}
                </td>
                <td className="left">{r.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="panel-note">{d.loanSummaryNote}</p>
    </Panel>
  );
}

/** The purchase's funding: sources and uses and the gap between them (ADR 0119 §9). */
export function AcquisitionPanel({ view }: { view: AcquisitionView }) {
  const d = useT().propertyDetail;
  return (
    <Panel title={d.acqTitle} hint={d.acqHint}>
      <StatList
        rows={view.rows.map((r) => ({
          k: r.label,
          v: r.value ? <Money value={r.value} parens={false} /> : r.missing,
        }))}
      />
      {/* A standing note, not an alert: a gap never blocks (ADR 0119 §4). */}
      {view.warning && (
        <div className="banner warn" role="note">
          {view.warning}
        </div>
      )}
      {view.note && <p className="panel-note funding-note">{view.note}</p>}
      <p className="panel-note">{d.acqNote}</p>
    </Panel>
  );
}

/** Monthly amortization table for the block driving the schedule. */
export function AmortizationTable({
  schedule,
}: {
  schedule: AmortizationRow[];
}) {
  const t = useT();
  const extras = amortizationExtras(schedule, t.propertyDetail);
  return (
    <TableWrap
      label={t.propertyDetail.amortizationTitle}
      style={{ maxHeight: 320 }}
    >
      <table className="data">
        <caption className="sr-only">
          {t.propertyDetail.amortizationTitle}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="left">
              {t.propertyDetail.amColMonth}
            </th>
            <th scope="col" className="left">
              {t.propertyDetail.amColDate}
            </th>
            <th scope="col">{t.propertyDetail.amColRate}</th>
            <th scope="col">{t.propertyDetail.amColInstalment}</th>
            <th scope="col">{t.propertyDetail.amColInterest}</th>
            <th scope="col">{t.propertyDetail.amColPrincipal}</th>
            {extras.map(({ key, header }) => (
              <th key={key} scope="col">
                {header}
              </th>
            ))}
            <th scope="col">{t.propertyDetail.amColEndBalance}</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row, i) => {
            const prev = schedule[i - 1];
            const reset = prev !== undefined && !row.ratePa.equals(prev.ratePa);
            return (
              <tr key={row.month} className={reset ? "is-milestone" : ""}>
                <td className="left">{row.month}</td>
                <td className="left">
                  {row.dueDate ? fmtDate(row.dueDate) : "—"}
                </td>
                <td>
                  <Pct value={row.ratePa} dp={2} />
                </td>
                <td>
                  <Money value={row.instalment} parens={false} suffix={false} />
                </td>
                <td>
                  <Money value={row.interest} parens={false} suffix={false} />
                </td>
                <td>
                  <Money value={row.principal} parens={false} suffix={false} />
                </td>
                {extras.map(({ key }) => (
                  <td key={key}>
                    <Money value={row[key]} parens={false} suffix={false} />
                  </td>
                ))}
                <td>
                  <Money value={row.endBalance} parens={false} suffix={false} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
