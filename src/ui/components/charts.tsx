// Recharts wrappers themed to the design tokens. Engine Decimals become plain numbers
// HERE (the chart boundary) and nowhere upstream. Axes label in millions (M Kč).
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { createContext, useContext, useState } from "react";
import { Table2 } from "lucide-react";
import {
  fmtCzk,
  fmtCzkAxisTick,
  fmtPct,
  pickCzkAxisUnit,
  type CzkAxisUnit,
} from "../../lib/format";
import {
  SERIES,
  tipValue,
  tableValue,
  tableYear,
  tooltipTotal,
  seriesTipItems,
  type TipItem,
} from "../model/chartData";
import { yearLabel } from "../model/projection";
import { CZK } from "../../lib/currency";
import { Button, Money, Pct, TableWrap } from "./primitives";
import { useT } from "../hooks/useT";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/** Compute axis unit from rows by inspecting the values at the given numeric keys. */
function czkUnitFromRows(
  rows: readonly Record<string, unknown>[],
  keys: readonly string[],
  thousands: string,
): CzkAxisUnit {
  const values: number[] = [];
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === "number") values.push(v);
    }
  }
  return pickCzkAxisUnit(values, thousands);
}

// CSS-var strings resolve inside SVG, so the grid colour tracks the active theme. Tick
// colour and size live in components.css.
const GRID = "var(--hairline)";

/** The chart surface's accessible name, set by the enclosing ChartCard (ADR 0114). */
const SurfaceLabel = createContext<string | undefined>(undefined);

/** `role="img"` + the card's name for a chart's <svg>. Recharts keeps it a tab stop, so
 *  the arrow keys still step the tooltip (ADR 0114). */
function useSurfaceProps() {
  const label = useContext(SurfaceLabel);
  return label === undefined ? {} : { role: "img", "aria-label": label };
}

/** A short line in a series' colour and dash: the legend and tooltip key (ADR 0114). */
function SeriesSwatch({
  color,
  dash,
}: {
  color: string;
  dash?: string | undefined;
}) {
  return (
    <svg
      className="series-swatch"
      width={16}
      height={4}
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={0}
        y1={2}
        x2={16}
        y2={2}
        stroke={color}
        strokeWidth={3}
        strokeDasharray={dash}
      />
    </svg>
  );
}

/** What the card plots: lines, sign-stacked bars, or one series as green/red bars. */
type ChartShape = "lines" | "stacked" | "signed";

/** A chart card: title, subtitle, the chart and a legend built from `series` (by default
 *  only for two or more series). The Table toggle swaps the chart for a table of the same
 *  rows, the keyboard and screen-reader way to read the values (UX-075); not saved. For
 *  `kind: "czk"` the axis unit is taken once from the rows' values (e.g. "M Kč"): it
 *  leads the subtitle and scales the ticks. `totalLabel` adds a net-of-stack row to a
 *  stacked chart's tooltip. */
export function ChartCard({
  title,
  sub,
  kind,
  chart = "lines",
  rows,
  series,
  legend = series.length > 1,
  totalLabel,
}: {
  title: string;
  sub?: string | undefined;
  kind: "czk" | "pct";
  chart?: ChartShape;
  rows: readonly Record<string, unknown>[];
  series: readonly SeriesDef[];
  legend?: boolean | undefined;
  totalLabel?: string | undefined;
}) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  const unit =
    kind === "czk"
      ? czkUnitFromRows(
          rows,
          series.map((s) => s.key),
          t.common.thousandsShort,
        )
      : undefined;
  // The table lists whole Kč; the chart's axis may count in thousands or millions.
  const unitLabel = unit && (asTable ? CZK.symbol : unit.label);
  const resolvedSub = unitLabel
    ? sub
      ? `${unitLabel} — ${sub}`
      : unitLabel
    : sub;
  return (
    <div className="chart-card">
      <div className="chart-head">
        <div>
          <div className="chart-title">{title}</div>
          {resolvedSub && <div className="chart-sub">{resolvedSub}</div>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={Table2}
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          {t.charts.table}
        </Button>
      </div>
      {asTable ? (
        <ChartTable title={title} kind={kind} rows={rows} series={series} />
      ) : (
        <SurfaceLabel.Provider value={t.charts.surfaceLabel(title)}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ChartBody
              kind={kind}
              chart={chart}
              rows={rows}
              series={series}
              unit={unit}
              totalLabel={totalLabel}
            />
          </ResponsiveContainer>
        </SurfaceLabel.Provider>
      )}
      {legend && !asTable && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <SeriesSwatch color={s.color} dash={s.dash} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const CHART_HEIGHT = 196;

/** The chart's rows as a table: one row per year, one column per series (UX-075).
 *  Amounts without "Kč", like the projection grid, so three columns fit the card. */
function ChartTable({
  title,
  kind,
  rows,
  series,
}: {
  title: string;
  kind: "czk" | "pct";
  rows: readonly Record<string, unknown>[];
  series: readonly SeriesDef[];
}) {
  const t = useT();
  return (
    <TableWrap label={title} style={{ height: CHART_HEIGHT }}>
      <table className="data chart-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col" className="left sticky-col">
              {t.projGrid.year}
            </th>
            {series.map((s) => (
              <th scope="col" key={s.key}>
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const year = tableYear(t, row);
            return (
              <tr key={year}>
                <th scope="row" className="left sticky-col">
                  {year}
                </th>
                {series.map((s) => {
                  const v = tableValue(row[s.key]);
                  return (
                    <td key={s.key}>
                      {v === null ? (
                        // A percent with no base (LTV on no value, ADR 0133).
                        kind === "pct" ? (
                          t.common.notApplicable
                        ) : (
                          "—"
                        )
                      ) : kind === "pct" ? (
                        <Pct value={v} />
                      ) : (
                        <Money value={v} suffix={false} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function Tip({
  active,
  year,
  point,
  items,
  total,
}: {
  active?: boolean | undefined;
  year?: number | string | undefined;
  /** The hovered row; when it carries the projection year the header reads
   *  "Y5 · 2031" (UX-032). */
  point?: { year?: unknown; calendarYear?: unknown };
  items: TipItem[];
  /** Optional summary row rendered below a divider (e.g. net change of stacked series). */
  total?: { label: string; value: number } | undefined;
}) {
  const t = useT();
  if (!active) return null;
  const heading =
    typeof point?.year === "number" && typeof point.calendarYear === "number"
      ? yearLabel(t, point.year, point.calendarYear)
      : year;
  return (
    <div className="chart-tooltip">
      <div className="tt-year">{heading}</div>
      {items.map((it) => (
        <div className="tt-row" key={it.label}>
          <span className="tt-label">
            <SeriesSwatch color={it.color} dash={it.dash} />
            {it.label}
          </span>
          <span>
            {it.value === null
              ? it.kind === "pct"
                ? t.common.notApplicable // no base (ADR 0133)
                : "—"
              : it.kind === "pct"
                ? fmtPct(it.value)
                : fmtCzk(it.value, { parens: true })}
          </span>
        </div>
      ))}
      {total && (
        <div className="tt-row tt-total">
          <span>{total.label}</span>
          <span>{fmtCzk(total.value, { parens: true })}</span>
        </div>
      )}
    </div>
  );
}

const pctAxis = (v: number) => fmtPct(v, 0);

// `key` is a string (not `keyof ChartRow`) so callers can overlay arbitrary series —
// e.g. one line per scenario keyed `s0`,`s1`,… on a merged row (Scenarios compare view).
interface SeriesDef {
  key: string;
  name: string;
  color: string;
  /** SVG strokeDasharray, e.g. "6 3"; solid when absent (ADR 0114). */
  dash?: string | undefined;
  /** shortcut: the Dashboard LTV line keeps Recharts' default hover dot, as before the
   *  shared chart body; ADR 0188 gives it the r=3 dot of the other lines. */
  defaultActiveDot?: boolean | undefined;
}

const MARGIN = { top: 6, right: 8, bottom: 0, left: 4 };

/** The chart inside a card: one grid and axis frame for every shape. A percent chart's
 *  axis starts at 0 and its tooltip keeps a null LTV, read as n/a (ADR 0133). */
function ChartBody({
  kind,
  chart,
  rows,
  series,
  unit,
  totalLabel,
}: {
  kind: "czk" | "pct";
  chart: ChartShape;
  rows: readonly Record<string, unknown>[];
  series: readonly SeriesDef[];
  /** The card's CZK axis unit; none for a percent chart. */
  unit: CzkAxisUnit | undefined;
  totalLabel: string | undefined;
}) {
  // Reduce motion: no entry animation (UX-058).
  const animate = !usePrefersReducedMotion();
  const surface = useSurfaceProps();
  const data = rows as Record<string, unknown>[];
  const pct = kind === "pct";
  const tick = unit ? (v: number) => fmtCzkAxisTick(v, unit) : pctAxis;
  const frame = [
    <CartesianGrid key="grid" stroke={GRID} vertical={false} />,
    <XAxis
      key="x"
      dataKey="calendarYear"
      tickLine={false}
      axisLine={false}
      minTickGap={28}
    />,
    <YAxis
      key="y"
      tickFormatter={tick}
      tickLine={false}
      axisLine={false}
      width="auto"
      {...(pct && { domain: [0, "auto"] })}
    />,
  ];

  if (chart === "lines")
    return (
      <LineChart data={data} margin={MARGIN} {...surface}>
        {frame}
        <Tooltip
          {...(pct && { filterNull: false })}
          content={({ active, label, payload }) => (
            <Tip
              active={active}
              year={label}
              point={payload?.[0]?.payload}
              items={seriesTipItems(payload, series, pct ? "pct" : "czk")}
            />
          )}
        />
        {series.map((s) => (
          <Line
            isAnimationActive={animate}
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            // Spread, not strokeDasharray={undefined}: exactOptionalPropertyTypes.
            {...(s.dash && { strokeDasharray: s.dash })}
            strokeWidth={2}
            dot={false}
            {...(!s.defaultActiveDot && { activeDot: { r: 3 } })}
          />
        ))}
      </LineChart>
    );

  const zero = <ReferenceLine y={0} stroke="var(--hairline-strong)" />;
  if (chart === "stacked")
    // Stacks share one `stackId`; negative segments drop below the zero line.
    return (
      <BarChart data={data} stackOffset="sign" margin={MARGIN} {...surface}>
        {frame}
        {zero}
        <Tooltip
          content={({ active, label, payload }) => {
            const items = seriesTipItems(payload, series, "czk", Number);
            const total =
              totalLabel !== undefined
                ? {
                    label: totalLabel,
                    value: tooltipTotal(items.map((it) => it.value ?? 0)),
                  }
                : undefined;
            return (
              <Tip
                active={active}
                year={label}
                point={payload?.[0]?.payload}
                items={items}
                total={total}
              />
            );
          }}
        />
        {series.map((s) => (
          <Bar
            isAnimationActive={animate}
            key={s.key}
            stackId="stack"
            dataKey={s.key}
            name={s.name}
            fill={s.color}
          />
        ))}
      </BarChart>
    );

  // Signed: one series (net cash flow), green above zero, red below.
  const { key, name } = series[0] ?? { key: "", name: "" };
  const sign = (v: unknown) =>
    Number(v ?? 0) < 0 ? SERIES.negative : SERIES.positive;
  return (
    <BarChart data={data} margin={MARGIN} {...surface}>
      {frame}
      {zero}
      <Tooltip
        content={({ active, label, payload }) => (
          <Tip
            active={active}
            year={label}
            point={payload?.[0]?.payload}
            items={(payload ?? []).map((p) => ({
              label: name,
              value: tipValue(p.value),
              color: sign(p.value),
              kind: "czk",
            }))}
          />
        )}
      />
      <Bar dataKey={key} name={name} isAnimationActive={animate}>
        {data.map((d, i) => (
          <Cell key={i} fill={sign(d[key])} />
        ))}
      </Bar>
    </BarChart>
  );
}
