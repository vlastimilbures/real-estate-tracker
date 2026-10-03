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
import { useState, type ReactNode } from "react";
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
  czkAxisWidth,
  tipValue,
  tableValue,
  tableYear,
  tooltipTotal,
  type ChartRow,
} from "../model/chartData";
import { yearLabel } from "../model/projection";
import { currencySymbol } from "../../lib/currency";
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

// CSS-var strings resolve inside SVG, so grid/axis colors track the active theme.
const GRID = "var(--hairline)";
const AXIS_TICK = { fill: "var(--ink-soft)" } as const;

/** A chart card: title, subtitle and a legend built from `series` (by default only for
 *  two or more series). The Table toggle swaps the chart for a table of the same rows,
 *  the keyboard and screen-reader way to read the values (UX-075); not saved. For `kind: "czk"` the subtitle leads with the axis unit taken from the
 *  rows' values (e.g. "M Kč"). */
export function ChartCard({
  title,
  sub,
  kind,
  rows,
  series,
  legend = series.length > 1,
  children,
}: {
  title: string;
  sub?: string | undefined;
  kind: "czk" | "pct";
  rows: readonly Record<string, unknown>[];
  series: readonly SeriesDef[];
  legend?: boolean | undefined;
  children: ReactNode;
}) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  // The table lists whole Kč; the chart's axis may count in thousands or millions.
  const unitLabel =
    kind !== "czk"
      ? undefined
      : asTable
        ? currencySymbol()
        : czkUnitFromRows(
            rows,
            series.map((s) => s.key),
            t.common.thousandsShort,
          ).label;
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
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          {children}
        </ResponsiveContainer>
      )}
      {legend && !asTable && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} /> {s.name}
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
                        "—"
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

interface TipItem {
  label: string;
  value: number | null; // null: not plotted (e.g. a year-0 flow) ⇒ "—"
  color: string;
  kind: "czk" | "pct";
}
function Tip({
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
          <span style={{ color: it.color }}>{it.label}</span>
          <span>
            {it.value === null
              ? "—"
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
}

/** A row whose numeric series are addressed by string key (superset of ChartRow). */
type MultiRow = Record<string, number | null>;

/** Multi-line CZK chart (e.g. value vs debt vs equity, rent gross/effective, NOI vs DS). */
export function CzkLines({
  data,
  series,
}: {
  data: MultiRow[];
  series: SeriesDef[];
}) {
  // Reduce motion: no entry animation (UX-058).
  const animate = !usePrefersReducedMotion();
  const t = useT();
  const keys = series.map((s) => s.key);
  const unit = czkUnitFromRows(data, keys, t.common.thousandsShort);
  const axisW = czkAxisWidth(unit, data, keys);
  return (
    <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis
        dataKey="calendarYear"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        minTickGap={28}
      />
      <YAxis
        tickFormatter={(v: number) => fmtCzkAxisTick(v, unit)}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={axisW}
      />
      <Tooltip
        content={({ active, label, payload }) => (
          <Tip
            active={active}
            year={label}
            point={payload?.[0]?.payload}
            items={(payload ?? []).map((p) => ({
              label:
                series.find((s) => s.key === p.dataKey)?.name ??
                String(p.dataKey),
              value: tipValue(p.value),
              color: p.color as string,
              kind: "czk",
            }))}
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
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
        />
      ))}
    </LineChart>
  );
}

/** Signed bars (net cash flow): green above zero, red below. */
export function SignedBars({
  data,
  dataKey,
  name,
}: {
  data: ChartRow[];
  dataKey: keyof ChartRow;
  name: string;
}) {
  // Reduce motion: no entry animation (UX-058).
  const animate = !usePrefersReducedMotion();
  const t = useT();
  const key = String(dataKey);
  const unit = czkUnitFromRows(
    data as unknown as Record<string, unknown>[],
    [key],
    t.common.thousandsShort,
  );
  const axisW = czkAxisWidth(
    unit,
    data as unknown as Record<string, unknown>[],
    [key],
  );
  return (
    <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis
        dataKey="calendarYear"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        minTickGap={28}
      />
      <YAxis
        tickFormatter={(v: number) => fmtCzkAxisTick(v, unit)}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={axisW}
      />
      <ReferenceLine y={0} stroke="var(--hairline-strong)" />
      <Tooltip
        content={({ active, label, payload }) => (
          <Tip
            active={active}
            year={label}
            point={payload?.[0]?.payload}
            items={(payload ?? []).map((p) => ({
              label: name,
              value: tipValue(p.value),
              color: Number(p.value) < 0 ? SERIES.negative : SERIES.positive,
              kind: "czk",
            }))}
          />
        )}
      />
      <Bar dataKey={dataKey} name={name} isAnimationActive={animate}>
        {data.map((d, i) => (
          <Cell
            key={i}
            fill={(d[dataKey] ?? 0) < 0 ? SERIES.negative : SERIES.positive}
          />
        ))}
      </Bar>
    </BarChart>
  );
}

/** Stacked CZK bars (e.g. equity change = appreciation + debt paydown). Stacks share one
 *  `stackId`; negative segments drop below the zero reference line. `totalLabel`, when set,
 *  adds a net-of-stack summary row to the tooltip. */
export function StackedCzkBars({
  data,
  series,
  totalLabel,
}: {
  data: MultiRow[];
  series: SeriesDef[];
  totalLabel?: string | undefined;
}) {
  // Reduce motion: no entry animation (UX-058).
  const animate = !usePrefersReducedMotion();
  const t = useT();
  const sKeys = series.map((s) => s.key);
  const unit = czkUnitFromRows(data, sKeys, t.common.thousandsShort);
  const axisW = czkAxisWidth(unit, data, sKeys);
  return (
    <BarChart
      data={data}
      stackOffset="sign"
      margin={{ top: 6, right: 8, bottom: 0, left: 4 }}
    >
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis
        dataKey="calendarYear"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        minTickGap={28}
      />
      <YAxis
        tickFormatter={(v: number) => fmtCzkAxisTick(v, unit)}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={axisW}
      />
      <ReferenceLine y={0} stroke="var(--hairline-strong)" />
      <Tooltip
        content={({ active, label, payload }) => {
          const items = (payload ?? []).map((p) => ({
            label:
              series.find((s) => s.key === p.dataKey)?.name ??
              String(p.dataKey),
            value: Number(p.value),
            color: p.color as string,
            kind: "czk" as const,
          }));
          const total =
            totalLabel !== undefined
              ? {
                  label: totalLabel,
                  value: tooltipTotal(items.map((it) => it.value)),
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
}

/** Multi-line percent chart (e.g. LTV across scenarios). */
export function PctLines({
  data,
  series,
}: {
  data: MultiRow[];
  series: SeriesDef[];
}) {
  // Reduce motion: no entry animation (UX-058).
  const animate = !usePrefersReducedMotion();
  return (
    <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis
        dataKey="calendarYear"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        minTickGap={28}
      />
      <YAxis
        tickFormatter={pctAxis}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={40}
        domain={[0, "auto"]}
      />
      <Tooltip
        content={({ active, label, payload }) => (
          <Tip
            active={active}
            year={label}
            point={payload?.[0]?.payload}
            items={(payload ?? []).map((p) => ({
              label:
                series.find((s) => s.key === p.dataKey)?.name ??
                String(p.dataKey),
              value: tipValue(p.value),
              color: p.color as string,
              kind: "pct",
            }))}
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
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
        />
      ))}
    </LineChart>
  );
}

/** Single percent line (LTV). */
export function PctLine({
  data,
  dataKey,
  name,
  color = SERIES.slate,
}: {
  data: ChartRow[];
  dataKey: keyof ChartRow;
  name: string;
  color?: string | undefined;
}) {
  // Reduce motion: no entry animation (UX-058).
  const animate = !usePrefersReducedMotion();
  return (
    <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis
        dataKey="calendarYear"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        minTickGap={28}
      />
      <YAxis
        tickFormatter={pctAxis}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={40}
        domain={[0, "auto"]}
      />
      <Tooltip
        content={({ active, label, payload }) => (
          <Tip
            active={active}
            year={label}
            point={payload?.[0]?.payload}
            items={(payload ?? []).map((p) => ({
              label: name,
              value: tipValue(p.value),
              color,
              kind: "pct",
            }))}
          />
        )}
      />
      <Line
        isAnimationActive={animate}
        type="monotone"
        dataKey={dataKey}
        name={name}
        stroke={color}
        strokeWidth={2}
        dot={false}
      />
    </LineChart>
  );
}
