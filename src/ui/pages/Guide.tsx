import { useEffect, type ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import { useUiStore } from "../../state/uiStore";
import { Panel } from "../components/primitives";
import { useT } from "../hooks/useT";
import "../styles/guide.css";

// Static, dependency-free reference page. Pure presentation — no engine imports; the only
// store read is the glossary term a metric label asked to show (UX-044). Explains how the financial engine computes each number and what it means,
// using generic round-number examples (not the sample portfolio). Left-aligned definition
// grids replace the right-aligned StatList primitive, which is for label→number rows.

/** Inline formula chip (text font, petrol wash) — not monospace. */
function F({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  return (
    <span className={wrap ? "guide-formula wrap" : "guide-formula"}>
      {children}
    </span>
  );
}

type Def = { name: string; formula: string; meaning: string; eg?: string };

/** Two-column definition grid: name + formula chip | meaning + example. */
function Defs({ rows, egLabel }: { rows: Def[]; egLabel: string }) {
  return (
    <div className="guide-defs">
      {rows.map((r) => (
        <div className="guide-def" key={r.name}>
          <div className="guide-def-term">
            <span className="guide-def-name">{r.name}</span>
            <F>{r.formula}</F>
          </div>
          <div className="guide-def-desc">
            {r.meaning}
            {r.eg && (
              <span className="guide-eg">
                {egLabel} {r.eg}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Guide() {
  const t = useT();
  const g = t.guide;
  const guideTerm = useUiStore((s) => s.guideTerm);
  const clearGuideTerm = useUiStore((s) => s.clearGuideTerm);
  // A metric label asked for this term (UX-044): bring it into view and focus it once.
  useEffect(() => {
    if (!guideTerm) return;
    const el = document.getElementById(`glossary-${guideTerm}`);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus();
    clearGuideTerm();
  }, [guideTerm, clearGuideTerm]);
  const sd = g.snapshotDefs;
  const pd = g.projectionDefs;
  const rd = g.returnsDefs;
  const cd = g.scenarioDefs;

  const SNAPSHOT: Def[] = [
    sd.value,
    sd.debt,
    sd.equity,
    sd.ltv,
    sd.grossRent,
    sd.effectiveIncome,
    sd.holdingCosts,
    sd.noi,
    sd.debtService,
    sd.netCashFlow,
    sd.dscr,
    sd.grossYield,
    sd.netYield,
    sd.weightedAvgRate,
  ];
  const PROJECTION: Def[] = [pd.value, pd.rent, pd.vacancy, pd.costs, pd.debt];
  const RETURNS: Def[] = [rd.multiple, rd.cagr, rd.irr];
  const GLOSSARY = Object.entries(g.glossary).map(([key, v]) => ({
    key,
    ...v,
  }));

  return (
    <AppShell title={g.title} subtitle={g.subtitle} showLens={false}>
      <Panel title={g.howItWorksTitle} hint={g.howItWorksHint}>
        <div className="guide-cards">
          <div className="guide-card">
            <h4>{g.cardFlowTitle}</h4>
            <p>{g.cardFlowBody}</p>
          </div>
          <div className="guide-card">
            <h4>{g.cardAsOfTitle}</h4>
            <p>{g.cardAsOfBody}</p>
          </div>
          <div className="guide-card">
            <h4>{g.cardEffectiveTitle}</h4>
            <p>{g.cardEffectiveBody}</p>
          </div>
        </div>
      </Panel>

      <Panel title={g.snapshotTitle} hint={g.snapshotHint}>
        <Defs rows={SNAPSHOT} egLabel={g.eg} />
        <p className="guide-prose" style={{ marginTop: "var(--s4)" }}>
          {g.snapshotProse}
        </p>
      </Panel>

      <Panel title={g.mortgagesTitle} hint={g.mortgagesHint}>
        <p className="guide-prose">
          {g.mortgagesProse1Pre}
          <strong>{g.mortgagesProse1Annuities}</strong>
          {g.mortgagesProse1Mid}
          <F wrap>{g.fInterest}</F> <F wrap>{g.fPrincipal}</F>{" "}
          <F wrap>{g.fNewBalance}</F>
          {g.mortgagesProse1Post}
        </p>
        <p className="guide-prose">
          {g.mortgagesProse2Pre}
          <strong>{g.mortgagesProse2Fixation}</strong>
          {g.mortgagesProse2Mid}
          <strong>{g.mortgagesProse2Resets}</strong>
          {g.mortgagesProse2Mid2}
          <strong>{g.mortgagesProse2Reamortizes}</strong>
          {g.mortgagesProse2Post}
        </p>
      </Panel>

      <Panel title={g.projectionTitle} hint={g.projectionHint}>
        <p className="guide-prose">{g.projectionProse1}</p>
        <Defs rows={PROJECTION} egLabel={g.eg} />
        <p className="guide-prose" style={{ marginTop: "var(--s4)" }}>
          {g.projectionProse2}
        </p>
      </Panel>

      <Panel title={g.nominalRealTitle} hint={g.nominalRealHint}>
        <p className="guide-prose">
          {g.nominalRealProsePre}
          <F wrap>{g.fCpi}</F> <F wrap>{g.fReal}</F>
          {g.nominalRealProsePost}
        </p>
        <p className="guide-prose" style={{ marginTop: "var(--s4)" }}>
          {g.nominalRealTodayNote}
        </p>
      </Panel>

      <Panel title={g.returnsTitle} hint={g.returnsHint}>
        <Defs rows={RETURNS} egLabel={g.eg} />
      </Panel>

      <Panel title={g.scenariosTitle} hint={g.scenariosHint}>
        <p className="guide-prose">{g.scenariosProse}</p>
        <Defs
          rows={[cd.inflationShock, cd.rateShock, cd.valueCrash]}
          egLabel={g.eg}
        />
      </Panel>

      <Panel title={g.developmentTitle} hint={g.developmentHint}>
        <p className="guide-prose">
          {g.developmentProsePre}
          <strong>{g.developmentTranches}</strong>
          {g.developmentProseMid}
          <strong>{g.developmentInterestOnly}</strong>
          {g.developmentProsePost}
        </p>
      </Panel>

      <Panel title={g.glossaryTitle}>
        <div className="guide-glossary">
          {GLOSSARY.map((gl) => (
            <div
              className="guide-gloss"
              key={gl.key}
              id={`glossary-${gl.key}`}
              tabIndex={-1}
            >
              <span className="guide-gloss-term">{gl.term}</span>{" "}
              <span className="guide-gloss-def">— {gl.def}</span>
            </div>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}
