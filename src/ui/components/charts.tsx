// Recharts wrappers themed to the design tokens. They plot plain numbers: engine
// Decimals become numbers in ui/model/chartData.ts, the chart boundary. A CZK axis counts
// in the unit its values call for (pickCzkAxisUnit: M Kč, thousands of Kč with the
// interface language's word for thousands, or Kč); a percent axis in whole percent.
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
import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { Table2 } from "lucide-react";
import {
  fmtCzk,
  fmtCzkAxisTick,
  fmtPct,
  pickCzkAxisUnit,
  type CzkAxisUnit,
} from "../../lib/format";
import { SERIES } from "../model/chartSeries";
import {
  tipValue,
  tableValue,
  tableYear,
  tooltipTotal,
  seriesTipItems,
  type TipItem,
} from "../model/chartData";
import { yearLabel } from "../model/projection";
import type { ResetMarker } from "../model/financing";
import { CZK } from "../../lib/currency";
import { Button } from "./Button";
import { Money } from "./figures";
import { TableWrap } from "./layout";
import { Pct } from "./rates";
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

// CSS-var strings resolve inside SVG, so the grid and tick colours track the active
// theme. Recharts 3.11+ writes a tick's fill as an inline style (its `#666` default when
// none is given), which outranks any stylesheet rule, so the tick colour is a prop; the
// tick size stays in charts.css (ADR 0114).
const GRID = "var(--hairline)";
/** Shared axis props: the tick colour, no tick or axis lines. */
const AXIS = {
  tick: { fill: "var(--ink-soft)" },
  tickLine: false,
  axisLine: false,
} as const;

/** The chart surface's accessible name, set by the enclosing ChartCard (ADR 0114). */
const SurfaceLabel = createContext<string | undefined>(undefined);

/** `role="img"` + the card's name for a chart's <svg>. Recharts keeps it a tab stop, so
 *  the arrow keys still step the tooltip (ADR 0114). */
function useSurfaceProps() {
  const label = useContext(SurfaceLabel);
  return label === undefined ? {} : { role: "img", "aria-label": label };
}

/** The fixation-end marker (ADR 0210): a dashed line in the soft ink colour with a
 *  diamond, not colour alone; at least 3:1 on the plot in both themes. */
const MARKER_COLOR = "var(--ink-soft)";
const MARKER_DASH = "3 3";

function MarkerSwatch() {
  return (
    <svg
      className="series-swatch"
      width={16}
      height={10}
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={8}
        y1={0}
        x2={8}
        y2={10}
        stroke={MARKER_COLOR}
        strokeWidth={1.5}
        strokeDasharray={MARKER_DASH}
      />
      <path d="M 8 1 L 11 4 L 8 7 L 5 4 Z" fill={MARKER_COLOR} />
    </svg>
  );
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

/** What the card plots, with the props that only that shape takes: lines (with the
 *  fixation-end markers, ADR 0210), sign-stacked bars (with an optional net-of-stack row
 *  in the tooltip), or one series as green/red bars. */
export type ChartShape =
  | {
      type: "lines";
      /** Years marked with their fixation ends (ADR 0210). */
      markers?: readonly ResetMarker[] | undefined;
      /** The markers' tooltip heading; the legend names them `charts.rateReset`. */
      markerHeading?: string | undefined;
    }
  | {
      type: "stacked";
      /** Adds a net-of-stack row, under this label, to the tooltip. */
      totalLabel?: string | undefined;
    }
  | { type: "signed" };

const LINES: ChartShape = { type: "lines" };

/** The card's subtitle: the axis unit, then `sub` after a dash. The table lists whole Kč;
 *  the chart's axis may count in thousands or millions. */
function subtitleOf(
  sub: string | undefined,
  unit: CzkAxisUnit | undefined,
  asTable: boolean,
): string | undefined {
  const unitLabel = unit && (asTable ? CZK.symbol : unit.label);
  if (!unitLabel) return sub;
  return sub ? `${unitLabel} — ${sub}` : unitLabel;
}

/** A chart card: title, subtitle, the chart and a legend built from `series` (by default
 *  only for two or more series). The Table toggle swaps the chart for a table of the same
 *  rows, the keyboard and screen-reader way to read the values; not saved. For
 *  `kind: "czk"` the axis unit is taken once from the rows' values (e.g. "M Kč"): it
 *  leads the subtitle and scales the ticks. */
export function ChartCard({
  title,
  sub,
  kind,
  shape = LINES,
  rows,
  series,
  legend,
  height = CHART_HEIGHT,
}: {
  title: string;
  sub?: string | undefined;
  kind: "czk" | "pct";
  /** Lines when absent. */
  shape?: ChartShape | undefined;
  rows: readonly Record<string, unknown>[];
  series: readonly SeriesDef[];
  legend?: boolean | undefined;
  /** Plot (and table) height in px: the Dashboard's charts (ADR 0218) and Scenario
   *  compare's (ADR 0216). */
  height?: number | undefined;
}) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  // Markers are drawn on a line chart only (ADR 0210).
  const marked = shape.type === "lines" && (shape.markers?.length ?? 0) > 0;
  const showLegend = legend ?? (series.length > 1 || marked);
  const unit =
    kind === "czk"
      ? czkUnitFromRows(
          rows,
          series.map((s) => s.key),
          t.common.thousandsShort,
        )
      : undefined;
  const resolvedSub = subtitleOf(sub, unit, asTable);
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
        <ChartTable
          title={title}
          kind={kind}
          rows={rows}
          series={series}
          height={height}
        />
      ) : (
        <SurfaceLabel.Provider value={t.charts.surfaceLabel(title)}>
          <ResponsiveContainer width="100%" height={height}>
            <ChartBody
              kind={kind}
              shape={shape}
              rows={rows}
              series={series}
              unit={unit}
            />
          </ResponsiveContainer>
        </SurfaceLabel.Provider>
      )}
      {showLegend && !asTable && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <SeriesSwatch color={s.color} dash={s.dash} /> {s.name}
            </span>
          ))}
          {marked && (
            <span>
              <MarkerSwatch /> {t.charts.rateReset}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const CHART_HEIGHT = 196;
/** Scenario compare's plot height (ADR 0216). */
export const SMALL_CHART_HEIGHT = 180;

/** The chart's rows as a table: one row per year, one column per series.
 *  Amounts without "Kč", like the projection grid, so three columns fit the card. */
function ChartTable({
  title,
  kind,
  rows,
  series,
  height,
}: {
  title: string;
  kind: "czk" | "pct";
  rows: readonly Record<string, unknown>[];
  series: readonly SeriesDef[];
  height: number;
}) {
  const t = useT();
  return (
    <TableWrap label={title} style={{ height }}>
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
  resets,
}: {
  active?: boolean | undefined;
  year?: number | string | undefined;
  /** The hovered row; when it carries the projection year the header reads
   *  "Y5 · 2031". */
  point?: { year?: unknown; calendarYear?: unknown };
  items: TipItem[];
  /** Optional summary row rendered below a divider (e.g. net change of stacked series). */
  total?: { label: string; value: number } | undefined;
  /** The hovered year's fixation ends (ADR 0210 §3). */
  resets?: { heading: string; items: ResetMarker["resets"] } | undefined;
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
      {resets && resets.items.length > 0 && (
        <div className="tt-resets">
          <div className="tt-label">
            <MarkerSwatch />
            {resets.heading}
          </div>
          {resets.items.map((r) => (
            <div className="tt-row tt-reset" key={r.id}>
              <span>
                {r.name} · {r.date}
              </span>
              <span>{fmtCzk(r.balance)}</span>
            </div>
          ))}
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
}

const MARGIN = { top: 6, right: 8, bottom: 0, left: 4 };

/** What every body gets: the rows, the series, the grid and axes, the surface's name and
 *  whether to animate. */
interface BodyProps {
  data: Record<string, unknown>[];
  series: readonly SeriesDef[];
  frame: ReactElement[];
  surface: ReturnType<typeof useSurfaceProps>;
  animate: boolean;
}

/** Recharts' Tooltip `content` as a function, and what it is called with. */
type TipContent = Extract<
  ComponentProps<typeof Tooltip>["content"],
  (props: never) => unknown
>;
type TipArgs = Parameters<TipContent>[0];

/** The one tooltip wrapper: the hovered year's heading from Recharts' call, the rest of
 *  the Tip from the shape. */
function tipFor(
  rest: (
    label: TipArgs["label"],
    payload: TipArgs["payload"],
  ) => Pick<ComponentProps<typeof Tip>, "items" | "total" | "resets">,
): TipContent {
  return ({ active, label, payload }: TipArgs) => (
    <Tip
      active={active}
      year={label}
      point={payload?.[0]?.payload}
      {...rest(label, payload)}
    />
  );
}

/** The chart inside a card: one grid and axis frame for every shape. A percent chart's
 *  axis starts at 0 and its tooltip keeps a null LTV, read as n/a (ADR 0133). */
function ChartBody({
  kind,
  shape,
  rows,
  series,
  unit,
}: {
  kind: "czk" | "pct";
  shape: ChartShape;
  rows: readonly Record<string, unknown>[];
  series: readonly SeriesDef[];
  /** The card's CZK axis unit; none for a percent chart. */
  unit: CzkAxisUnit | undefined;
}) {
  // Reduce motion: no entry animation.
  const animate = !usePrefersReducedMotion();
  const surface = useSurfaceProps();
  const pct = kind === "pct";
  const tick = unit ? (v: number) => fmtCzkAxisTick(v, unit) : pctAxis;
  const body: BodyProps = {
    data: rows as Record<string, unknown>[],
    series,
    surface,
    animate,
    frame: [
      <CartesianGrid key="grid" stroke={GRID} vertical={false} />,
      <XAxis key="x" dataKey="calendarYear" {...AXIS} minTickGap={28} />,
      <YAxis
        key="y"
        {...AXIS}
        tickFormatter={tick}
        width="auto"
        {...(pct && { domain: [0, "auto"] })}
      />,
    ],
  };
  switch (shape.type) {
    case "lines":
      return (
        <LineBody
          {...body}
          pct={pct}
          markers={shape.markers ?? []}
          markerHeading={shape.markerHeading ?? ""}
        />
      );
    case "stacked":
      return <StackedBody {...body} totalLabel={shape.totalLabel} />;
    case "signed":
      return <SignedBody {...body} />;
  }
}

function LineBody({
  data,
  series,
  frame,
  surface,
  animate,
  pct,
  markers,
  markerHeading,
}: BodyProps & {
  pct: boolean;
  markers: readonly ResetMarker[];
  markerHeading: string;
}) {
  return (
    <LineChart data={data} margin={MARGIN} {...surface}>
      {frame}
      <Tooltip
        {...(pct && { filterNull: false })}
        content={tipFor((label, payload) => ({
          items: seriesTipItems(payload, series, pct ? "pct" : "czk"),
          resets: {
            heading: markerHeading,
            items: markers.find((m) => m.calendarYear === label)?.resets ?? [],
          },
        }))}
      />
      {/* Fixation ends (ADR 0210): a dashed line topped by a diamond. */}
      {markers.map((m) => (
        <ReferenceLine
          key={m.calendarYear}
          className="reset-marker"
          x={m.calendarYear}
          stroke={MARKER_COLOR}
          strokeWidth={1.5}
          strokeDasharray={MARKER_DASH}
          label={({ viewBox }: { viewBox?: { x?: number; y?: number } }) => {
            const x = viewBox?.x ?? 0;
            const y = viewBox?.y ?? 0;
            return (
              <path
                d={`M ${x} ${y} L ${x + 5} ${y + 5} L ${x} ${y + 10} L ${x - 5} ${y + 5} Z`}
                fill={MARKER_COLOR}
              />
            );
          }}
        />
      ))}
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
          activeDot={{ r: 3 }}
        />
      ))}
    </LineChart>
  );
}

const ZERO = <ReferenceLine y={0} stroke="var(--hairline-strong)" />;

function StackedBody({
  data,
  series,
  frame,
  surface,
  animate,
  totalLabel,
}: BodyProps & { totalLabel: string | undefined }) {
  // Stacks share one `stackId`; negative segments drop below the zero line.
  return (
    <BarChart data={data} stackOffset="sign" margin={MARGIN} {...surface}>
      {frame}
      {ZERO}
      <Tooltip
        content={tipFor((_label, payload) => {
          const items = seriesTipItems(payload, series, "czk", Number);
          const total =
            totalLabel !== undefined
              ? {
                  label: totalLabel,
                  value: tooltipTotal(items.map((it) => it.value ?? 0)),
                }
              : undefined;
          return { items, total };
        })}
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

const sign = (v: unknown) =>
  Number(v ?? 0) < 0 ? SERIES.negative : SERIES.positive;

/** One series (net cash flow), green above zero, red below. It plots the first series
 *  only; any other is in the legend but not drawn. With no series it still draws one bar
 *  of no key and no name, so the card keeps its frame. Both are kept as they are: changing either would change
 *  what a card draws (ChartMarkup.test.tsx pins them). */
function SignedBody({ data, series, frame, surface, animate }: BodyProps) {
  const { key, name } = series[0] ?? { key: "", name: "" };
  return (
    <BarChart data={data} margin={MARGIN} {...surface}>
      {frame}
      {ZERO}
      <Tooltip
        content={tipFor((_label, payload) => ({
          items: (payload ?? []).map((p) => ({
            label: name,
            value: tipValue(p.value),
            color: sign(p.value),
            kind: "czk",
          })),
        }))}
      />
      <Bar dataKey={key} name={name} isAnimationActive={animate}>
        {data.map((d, i) => (
          <Cell key={i} fill={sign(d[key])} />
        ))}
      </Bar>
    </BarChart>
  );
}
