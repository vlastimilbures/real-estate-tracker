// @vitest-environment jsdom
//
// #489: one submit state for every form. The hook runs the form's own check, shows a
// refused check or a failed save, ignores a submit while one runs (read from a ref, so
// two submits in one tick still write once), and drops the form-level message on the
// next edit and on each Save (ADR 0262 §1).
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFormSubmit, type FormSubmitOptions } from "../useFormSubmit";
import type { WriteError } from "../../../state/writeError";

const failure: WriteError = { kind: "other", message: "disk full" };
const split = (e: WriteError) => ({
  fieldErrors: e.kind === "other" ? { price: "bad" } : {},
  formError: e.kind === "other" ? e.message : null,
});
const valid = () => ({ ok: true as const, values: 5 });
const refused = () => ({ ok: false as const, errors: { price: "required" } });

function setup(over: Partial<FormSubmitOptions<number>> = {}) {
  const run = vi.fn<(v: number) => Promise<void | WriteError>>(() =>
    Promise.resolve(),
  );
  const opts = { run, mapErrors: split, ...over };
  const hook = renderHook(() => useFormSubmit<number>(opts));
  return { run, hook, result: hook.result };
}

async function failOnce(result: ReturnType<typeof setup>["result"]) {
  await act(() => result.current.submit(valid));
}

describe("useFormSubmit (#489)", () => {
  it("a refused check shows its errors and does not run", async () => {
    const onFailed = vi.fn();
    const { run, result } = setup({ onFailed });
    await act(() => result.current.submit(refused));
    expect(run).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({ price: "required" });
    expect(result.current.busy).toBe(false);
    expect(onFailed).toHaveBeenCalledWith({
      fieldErrors: { price: "required" },
      formError: null,
    });
  });

  it("a saved run calls onSaved with the values and shows nothing", async () => {
    const onSaved = vi.fn();
    const { run, result } = setup({ onSaved });
    await act(() => result.current.submit(valid));
    expect(run).toHaveBeenCalledWith(5);
    expect(onSaved).toHaveBeenCalledWith(5);
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBeNull();
  });

  it("a failed run is split onto its field and the form line", async () => {
    const onSaved = vi.fn();
    const onFailed = vi.fn();
    const { result } = setup({
      run: () => Promise.resolve(failure),
      onSaved,
      onFailed,
    });
    await failOnce(result);
    expect(result.current.errors).toEqual({ price: "bad" });
    expect(result.current.formError).toBe("disk full");
    expect(result.current.busy).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith({
      fieldErrors: { price: "bad" },
      formError: "disk full",
    });
  });

  it("a thrown run is shown like a returned failure (DR-090)", async () => {
    const { result } = setup({
      run: () => Promise.reject(new Error("gone")),
    });
    await failOnce(result);
    expect(result.current.formError).toBe("gone");
  });

  it("is busy while the run is pending", async () => {
    let finish: () => void = () => undefined;
    const { result } = setup({
      run: () => new Promise<void>((r) => (finish = r)),
    });
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.submit(valid);
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish();
      await done;
    });
    expect(result.current.busy).toBe(false);
  });

  it("two submits in one tick run once", async () => {
    const { run, result } = setup();
    await act(async () => {
      const first = result.current.submit(valid);
      const second = result.current.submit(valid);
      await Promise.all([first, second]);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a submit after the run ended runs again", async () => {
    const { run, result } = setup();
    await act(() => result.current.submit(valid));
    await act(() => result.current.submit(valid));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("clearFields drops the named fields' errors, or those a predicate matches", async () => {
    const { result } = setup();
    await act(() =>
      result.current.submit(() => ({
        ok: false,
        errors: { a: "1", b: "2", "rows.0": "3" },
      })),
    );
    act(() => result.current.clearFields(["a"]));
    expect(result.current.errors).toEqual({ b: "2", "rows.0": "3" });
    act(() => result.current.clearFields((k) => k.startsWith("rows.")));
    expect(result.current.errors).toEqual({ b: "2" });
  });

  it("clearAll drops every error and the form line", async () => {
    const { result } = setup({ run: () => Promise.resolve(failure) });
    await failOnce(result);
    act(() => result.current.clearAll());
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBeNull();
  });

  it("dismissFormError drops only the form line", async () => {
    const { result } = setup({ run: () => Promise.resolve(failure) });
    await failOnce(result);
    act(() => result.current.dismissFormError());
    expect(result.current.formError).toBeNull();
    expect(result.current.errors).toEqual({ price: "bad" });
  });

  it("detach: the running save ends its busy flag but writes no outcome", async () => {
    let finish: (e: WriteError) => void = () => undefined;
    const onFailed = vi.fn();
    const { result } = setup({
      run: () => new Promise<WriteError>((r) => (finish = r)),
      onFailed,
    });
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.submit(valid);
    });
    act(() => result.current.detach());
    await act(async () => {
      finish(failure);
      await done;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.formError).toBeNull();
    expect(onFailed).not.toHaveBeenCalled();
  });
});

describe("useFormSubmit: when the form line goes (ADR 0262 §1)", () => {
  it("an edit to any field clears it", async () => {
    const { result } = setup({ run: () => Promise.resolve(failure) });
    await failOnce(result);
    act(() => result.current.clearFields(["other"]));
    expect(result.current.formError).toBeNull();
    expect(result.current.errors).toEqual({ price: "bad" });
  });

  it("a Save its check refuses clears it", async () => {
    const { result } = setup({ run: () => Promise.resolve(failure) });
    await failOnce(result);
    await act(() => result.current.submit(refused));
    expect(result.current.formError).toBeNull();
  });

  it("a Save that starts clears it", async () => {
    let call = 0;
    const { result } = setup({
      run: () => Promise.resolve(call++ === 0 ? failure : undefined),
    });
    await failOnce(result);
    await act(() => result.current.submit(valid));
    expect(result.current.formError).toBeNull();
  });
});
