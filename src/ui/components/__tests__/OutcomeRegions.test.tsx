// @vitest-environment jsdom
//
// #136 (ADR 0154): the app shell's outcome regions. The toast's live region is in the
// page before any text arrives; a notice stays until dismissed, is translated when it
// renders, and carries a refused backup's records.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutcomeRegions, ToastRegion } from "../OutcomeRegions";
import { ExportXlsxButton } from "../primitives";
import { useUiStore } from "../../../state/uiStore";
import { RestoreError } from "../../../state/backup";
import { loadDictionary } from "../../../i18n";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";

vi.mock("../../../state/diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/diagnostics")>()),
  logFailure: vi.fn(),
}));

beforeEach(() => {
  act(() =>
    useUiStore.setState({
      language: "en",
      toast: null,
      notice: null,
      failure: null,
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast region (#136)", () => {
  it("is in the page, empty, before any toast", () => {
    render(<ToastRegion />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
  });

  it("shows the toast inside the same region", () => {
    render(<ToastRegion />);
    const region = screen.getByRole("status");
    act(() => useUiStore.getState().showToast("Saved"));
    expect(region.textContent).toBe("Saved");
  });
});

describe("notice (#136)", () => {
  it("names the safety backup, translated when it renders", async () => {
    act(() =>
      useUiStore.getState().setNotice({ kind: "restored", file: "s.json" }),
    );
    render(<OutcomeRegions />);
    expect(screen.getByText(en.backup.restored("s.json"))).toBeTruthy();

    await act(async () => {
      await loadDictionary("cs");
      useUiStore.setState({ language: "cs" });
    });
    expect(screen.getByText(cs.backup.restored("s.json"))).toBeTruthy();
  });

  it("a refused restore lists the records with the reason", () => {
    act(() =>
      useUiStore.getState().setFailure(
        "restore",
        new RestoreError("BACKUP_ROWS_INVALID", "rows", {
          issues: [
            {
              table: "leases",
              id: "l-1",
              column: "monthly_rent",
              rule: "UNREADABLE_VALUE",
            },
          ],
        }),
      ),
    );
    render(<OutcomeRegions />);
    expect(screen.getByText(en.backup.errRowsInvalid)).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("l-1")).toBeTruthy();
  });

  it("an export failure stays after the toast time (#136)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <>
        <ExportXlsxButton
          onExport={() => Promise.reject(new Error("disk full"))}
        />
        <OutcomeRegions />
      </>,
    );
    await user.click(
      screen.getByRole("button", { name: en.xlsx.exportToExcel }),
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText(en.xlsx.exportFailed("disk full"))).toBeTruthy();
  });

  it("a failure does not hide the safety copy's name (#136 review)", () => {
    act(() => {
      useUiStore.getState().setNotice({ kind: "restored", file: "s.json" });
      useUiStore.getState().setFailure("xlsxExport", new Error("disk full"));
    });
    render(<OutcomeRegions />);
    expect(screen.getByText(en.backup.restored("s.json"))).toBeTruthy();
    expect(screen.getByText(en.xlsx.exportFailed("disk full"))).toBeTruthy();
  });
});

// #274 (ADR 0189): each page mounts its own shell. A kept notice or failure is announced
// where it first appears; on later pages it stays, silent, until dismissed.
describe("announced once (#274)", () => {
  it("a notice keeps its live role only where it first shows", () => {
    act(() =>
      useUiStore.getState().setNotice({ kind: "restored", file: "a.json" }),
    );
    const first = render(<OutcomeRegions />);
    expect(screen.getByRole("status").textContent).toContain("a.json");
    first.unmount();

    render(<OutcomeRegions />);
    expect(screen.getByText(en.backup.restored("a.json"))).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    act(() =>
      useUiStore.getState().setNotice({ kind: "restored", file: "b.json" }),
    );
    expect(screen.getByRole("status").textContent).toContain("b.json");
  });

  it("a failure alerts and scrolls into view only where it first shows", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    act(() =>
      useUiStore.getState().setFailure("xlsxExport", new Error("disk full")),
    );
    const first = render(<OutcomeRegions />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
    first.unmount();

    render(<OutcomeRegions />);
    expect(screen.getByText(en.xlsx.exportFailed("disk full"))).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(scroll).toHaveBeenCalledTimes(1);
    // jsdom has no scrollIntoView; leave it as found.
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });
});
