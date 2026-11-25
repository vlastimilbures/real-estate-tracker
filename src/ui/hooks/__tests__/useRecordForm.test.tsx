// @vitest-environment jsdom
//
// #490: the record form's state as a hook. Pins what RecordForm did before the split:
// only the specs count as unsaved input (the loan type switch's key does not, ADR 0098),
// a list compares as its text, an edit drops its own errors and the form-level message
// (ADR 0141, ADR 0262 §1), a list edit drops all of the list's row errors, and a save
// makes the saved draft the new baseline.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecordForm, type RecordFormOptions } from "../useRecordForm";
import type { FieldSpec } from "../../model/formParse";
import type { WriteError } from "../../../state/writeError";

const specs = [
  { name: "startDate", label: "Start date", kind: "date" },
  { name: "amount", label: "Amount", kind: "money" },
  {
    name: "prepayments",
    label: "Prepayments",
    kind: "prepayments",
    optional: true,
  },
] as const satisfies readonly FieldSpec[];

const row =
  '{"date":"01.01.2028","amount":"100","effect":"lowerInstalment","fee":""}';
const sameRowOtherOrder =
  '{"amount":"100","date":"01.01.2028","effect":"lowerInstalment","fee":""}';

function setup(over: Partial<RecordFormOptions<typeof specs>> = {}) {
  const onSubmit = vi.fn<RecordFormOptions<typeof specs>["onSubmit"]>(
    async () => undefined,
  );
  const hook = renderHook(() =>
    useRecordForm({
      specs,
      initial: { startDate: "", amount: "", prepayments: `[${row}]` },
      onSubmit,
      ...over,
    }),
  );
  return { onSubmit, result: hook.result };
}

describe("useRecordForm (#490)", () => {
  it("a draft key that is not a spec is not an unsaved edit", () => {
    const { result } = setup();
    act(() => result.current.patch({ loanType: "development" }));
    expect(result.current.draft.loanType).toBe("development");
    expect(result.current.unsaved).toBe(false);
    act(() => result.current.patch({ amount: "5" }));
    expect(result.current.unsaved).toBe(true);
  });

  it("a list counts as unsaved when its text differs, key order included", () => {
    const { result } = setup();
    act(() => result.current.editList("prepayments", `[${sameRowOtherOrder}]`));
    expect(result.current.unsaved).toBe(true);
    act(() => result.current.editList("prepayments", `[${row}]`));
    expect(result.current.unsaved).toBe(false);
  });

  it("an edit drops its own field's error and the form-level message", async () => {
    const failure: WriteError = { kind: "other", message: "disk full" };
    const { result } = setup({ onSubmit: async () => failure });
    await act(async () => result.current.submit());
    expect(result.current.errors).toEqual({
      startDate: expect.any(String),
      amount: expect.any(String),
    });
    act(() => result.current.patch({ amount: "5" }));
    expect(Object.keys(result.current.errors)).toEqual(["startDate"]);
    act(() => result.current.patch({ startDate: "01.01.2027" }));
    await act(async () => result.current.submit());
    expect(result.current.formError).not.toBeNull();
    act(() => result.current.patch({ amount: "6" }));
    expect(result.current.formError).toBeNull();
  });

  it("a list edit drops the list's row errors and keeps the others", async () => {
    const failure: WriteError = {
      kind: "input",
      errors: [
        {
          code: "INVALID_DATE",
          entity: "mortgage",
          id: "m",
          field: "prepayments",
          index: 0,
        },
        {
          code: "INVALID_DATE",
          entity: "mortgage",
          id: "m",
          field: "startDate",
        },
      ],
    };
    const { result } = setup({
      initial: {
        startDate: "01.01.2027",
        amount: "5",
        prepayments: `[${row}]`,
      },
      onSubmit: async () => failure,
    });
    await act(async () => result.current.submit());
    expect(Object.keys(result.current.errors).sort()).toEqual([
      "prepayments.0",
      "startDate",
    ]);
    act(() => result.current.editList("prepayments", ""));
    expect(Object.keys(result.current.errors)).toEqual(["startDate"]);
  });

  it("a hidden field's save error goes to the form-level message", async () => {
    const failure: WriteError = {
      kind: "input",
      errors: [
        {
          code: "INVALID_DATE",
          entity: "mortgage",
          id: "m",
          field: "startDate",
        },
      ],
    };
    const { result } = setup({
      initial: { startDate: "01.01.2027", amount: "5", prepayments: "" },
      hiddenFields: () => ["startDate"],
      onSubmit: async () => failure,
    });
    expect(result.current.hidden).toEqual(["startDate"]);
    await act(async () => result.current.submit());
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).not.toBeNull();
  });

  it("a save makes the saved draft the new baseline", async () => {
    const { onSubmit, result } = setup({
      initial: { startDate: "01.01.2027", amount: "5", prepayments: "" },
    });
    act(() => result.current.patch({ amount: "7" }));
    expect(result.current.unsaved).toBe(true);
    await act(async () => result.current.submit());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(result.current.unsaved).toBe(false);
  });
});
