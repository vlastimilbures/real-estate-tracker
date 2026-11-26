// The Assumptions form's state (ADR 0095, 0221): the draft, its errors and the save. The
// Settings page holds it, so the form and the Save/Discard in the top bar read one draft.
import { useEffect, useMemo, useState } from "react";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../state/portfolioStore";
import { isDirty } from "../model/dirty";
import {
  collectValues,
  fieldHint,
  percentDraft,
  moneyDraft,
  dateDraft,
  FORM_PARSERS,
  type CollectRules,
} from "../model/formParse";
import { INT_RANGES } from "../../lib/rules";
import type { Assumptions } from "../../engine";
import { CZK } from "../../lib/currency";
import { type Dictionary } from "../../i18n";
import { useT } from "./useT";
import { fieldsIn, formWriteErrors } from "../model/writeError";
import { useToast } from "./useToast";
import { useFormSubmit } from "./useFormSubmit";
import { useLeaveGuard } from "./useLeaveGuard";

function buildSpecs(t: Dictionary) {
  const a = t.assumptions;
  return {
    drivers: [
      {
        name: "baseDate",
        label: a.baseDate,
        kind: "date",
        help: a.baseDateHelp,
      },
      {
        name: "horizonYears",
        label: a.horizon,
        kind: "int",
        suffix: t.common.yearsSuffix,
        range: INT_RANGES.horizonYears,
      },
      {
        name: "appreciationPa",
        label: a.appreciation,
        kind: "pct",
        suffix: "%",
      },
      {
        name: "rentIndexationPa",
        label: a.rentIndexation,
        kind: "pct",
        suffix: "%",
      },
      { name: "inflationPa", label: a.inflation, kind: "pct", suffix: "%" },
      { name: "vacancyAllowance", label: a.vacancy, kind: "pct", suffix: "%" },
      {
        name: "postFixationResetRatePa",
        label: a.postFixationReset,
        kind: "pct",
        suffix: "%",
      },
      {
        name: "sellingCostPct",
        label: a.sellingCost,
        kind: "pct",
        suffix: "%",
        help: a.sellingCostHelp,
      },
    ],
    defaults: [
      {
        name: "propertyTaxYr",
        label: a.propertyTax,
        kind: "money",
        suffix: CZK.symbol,
      },
      {
        name: "insuranceYr",
        label: a.insurance,
        kind: "money",
        suffix: CZK.symbol,
      },
      {
        name: "svjMonthly",
        label: a.svj,
        kind: "money",
        suffix: CZK.symbol,
      },
      {
        name: "otherYr",
        label: a.other,
        kind: "money",
        suffix: CZK.symbol,
      },
      { name: "mgmtPctRent", label: a.mgmt, kind: "pct", suffix: "%" },
      { name: "maintPctRent", label: a.maint, kind: "pct", suffix: "%" },
    ],
  } as const;
}

/** Every field is required; money defaults are 0 or more, as in RecordForm (ADR 0075). */
function assumptionRules(t: Dictionary): CollectRules {
  return {
    parsers: FORM_PARSERS,
    blank: (spec) => fieldHint(t, spec),
    invalid: (spec) => fieldHint(t, spec),
  };
}

function toDraft(a: Assumptions): Record<string, string> {
  return {
    baseDate: dateDraft(a.baseDate),
    horizonYears: String(a.horizonYears),
    appreciationPa: percentDraft(a.appreciationPa),
    rentIndexationPa: percentDraft(a.rentIndexationPa),
    inflationPa: percentDraft(a.inflationPa),
    vacancyAllowance: percentDraft(a.vacancyAllowance),
    postFixationResetRatePa: percentDraft(a.postFixationResetRatePa),
    sellingCostPct: percentDraft(a.sellingCostPct),
    propertyTaxYr: moneyDraft(a.defaults.propertyTaxYr),
    insuranceYr: moneyDraft(a.defaults.insuranceYr),
    svjMonthly: moneyDraft(a.defaults.svjMonthly),
    otherYr: moneyDraft(a.defaults.otherYr),
    mgmtPctRent: percentDraft(a.defaults.mgmtPctRent),
    maintPctRent: percentDraft(a.defaults.maintPctRent),
  };
}

export type AssumptionsForm = ReturnType<typeof useAssumptionsForm>;

/** A failed save that is not an input rule has no place in this form, so it goes to the
 *  banner (ADR 0261), even when the draft was dropped while it ran. */
async function bannerUnlessInput(
  save: Promise<MutationResult>,
): Promise<MutationResult> {
  const result = await save;
  if (!result.ok && result.error.kind !== "input")
    usePortfolioStore.getState().showError(result.error);
  return result;
}

/**
 * @param active whether the Assumptions tab shows; leaving it (the unsaved-changes guard
 *   lets that happen only when the user discards) drops the draft, as unmounting did.
 */
export function useAssumptionsForm(active: boolean) {
  const t = useT();
  const { drivers, defaults } = buildSpecs(t);
  const specs = [...drivers, ...defaults];
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const saveAssumptions = usePortfolioStore((s) => s.saveAssumptions);
  const initial = useMemo(
    () => (assumptions ? toDraft(assumptions) : null),
    [assumptions],
  );
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const { showToast } = useToast();
  // A failed save keeps the input and says so until the next edit (ADR 0095).
  const [failed, setFailed] = useState(false);
  // Bumped on a failed save so the error summary takes focus once it renders.
  const [summaryFocus, setSummaryFocus] = useState(0);

  // On failure a broken rule marks its field, or is listed in the error summary
  // when it names no field shown here (ADR 0141), until the next edit; any other failure
  // shows in the PageFrame banner, put there by bannerUnlessInput (ADR 0261). The page
  // owns focus after a save (ADR 0248 §4). The success toast shows only when the write
  // landed.
  const {
    busy: saving,
    errors,
    formError,
    submit,
    clearFields,
    clearAll,
    detach,
  } = useFormSubmit({
    run: async (next: Assumptions) => {
      const result = await bannerUnlessInput(saveAssumptions(next));
      return result.ok ? undefined : result.error;
    },
    mapErrors: (failure) => {
      const split = formWriteErrors(
        t,
        failure,
        fieldsIn(specs.map((s) => s.name)),
      );
      return {
        fieldErrors: split.fieldErrors,
        formError: failure.kind === "input" ? split.formError : null,
      };
    },
    // Saved: show the stored values again, so the form is no longer "unsaved".
    onSaved: () => {
      setDraft(null);
      setFailed(false);
      showToast(t.assumptions.saved);
    },
    // Keep the input, and focus the summary when it lists anything.
    onFailed: ({ fieldErrors, formError: rest }) => {
      setFailed(true);
      if (Object.keys(fieldErrors).length > 0 || rest)
        setSummaryFocus((n) => n + 1);
    },
    refocusOnFailure: false,
  });

  // A save that was running when the draft was dropped (the tab left through the guard)
  // must not write its outcome into the form shown later: reset detaches it.
  const clearDraft = () => {
    setDraft(null);
    clearAll();
    setFailed(false);
  };
  const reset = () => {
    detach();
    clearDraft();
  };

  // Leaving the tab drops the draft (adjusting state on a prop change, during render).
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) clearDraft();
  }
  useEffect(() => {
    if (!active) detach();
  }, [active, detach]);

  // re-sync when store loads / changes underneath
  const current = draft ?? initial;
  // Unsaved edits hold back navigation away from this tab.
  const unsaved = Boolean(initial && current && isDirty(initial, current));
  useLeaveGuard("assumptions", unsaved);

  const set = (name: string, v: string) => {
    if (!current) return;
    setDraft({ ...current, [name]: v });
    clearFields([name]);
    setFailed(false);
  };

  const check = (draftShown: Record<string, string>) => {
    const { values: v, errors: errs } = collectValues(
      specs,
      draftShown,
      assumptionRules(t),
    );
    if (Object.keys(errs).length > 0)
      return { ok: false as const, errors: errs };
    const next: Assumptions = {
      baseDate: v.baseDate,
      horizonYears: v.horizonYears,
      appreciationPa: v.appreciationPa,
      rentIndexationPa: v.rentIndexationPa,
      inflationPa: v.inflationPa,
      vacancyAllowance: v.vacancyAllowance,
      postFixationResetRatePa: v.postFixationResetRatePa,
      sellingCostPct: v.sellingCostPct,
      defaults: {
        propertyTaxYr: v.propertyTaxYr,
        insuranceYr: v.insuranceYr,
        svjMonthly: v.svjMonthly,
        otherYr: v.otherYr,
        mgmtPctRent: v.mgmtPctRent,
        maintPctRent: v.maintPctRent,
      },
    };
    return { ok: true as const, values: next };
  };

  const save = () => {
    if (!current) return;
    void submit(() => check(current));
  };

  return {
    drivers,
    defaults,
    /** The draft shown, or null before the portfolio loads. */
    current,
    errors,
    formError,
    invalid: specs.filter((s) => errors[s.name]),
    unsaved,
    saving,
    failed,
    summaryFocus,
    stateText: failed
      ? t.common.saveFailedKept
      : unsaved
        ? t.common.unsavedChanges
        : t.common.allChangesSaved,
    set,
    save,
    discard: reset,
  };
}
