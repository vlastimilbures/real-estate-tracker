// @vitest-environment jsdom
//
// The restore confirm (`RestoreConfirm`, `IssueTable`), shared by Settings → Backup and
// the startup error screen, one describe per behaviour:
// - the issue table's colours (ADR 0148 §1);
// - focus after a failed restore (ADR 0248 §1).
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IssueTable, RestoreConfirm } from "../RestoreConfirm";
import {
  SCHEMA_HEAD,
  type PickedBackup,
  type RestoreIssue,
} from "../../../state/backup";
import { deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

// ADR 0148 §1 (#260 item 6): a refused backup lists its out-of-range values too, in the
// error colour like the rest of its table; the confirm step's warnings use the warning
// colour. The colour is an inline style with no role or name, so the test reads it.
describe("IssueTable colours", () => {
  const issues: RestoreIssue[] = [
    {
      table: "properties",
      id: "javorova",
      column: "purchase_price",
      rule: "NEGATIVE_AMOUNT",
    },
    {
      table: "properties",
      id: "javorova",
      column: "size_m2",
      rule: "OUT_OF_RANGE",
      range: { min: 1, max: 10_000 },
    },
  ];

  const problemColours = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => (r.lastElementChild as HTMLElement).style.color);

  it("a refused file shows every row, out-of-range ones included, in the error colour", () => {
    render(<IssueTable issues={issues} />);
    expect(problemColours()).toEqual(["var(--negative)", "var(--negative)"]);
  });

  it("the confirm step's warnings use the warning colour", () => {
    render(<IssueTable issues={issues.slice(1)} warning />);
    expect(problemColours()).toEqual(["var(--warn)"]);
  });
});

// ADR 0248 §1 (#549): the confirm disables its buttons while the restore runs, which
// drops focus to <body>. After a failed restore focus goes to Cancel, unless the user
// moved it.
describe("focus after a failed restore", () => {
  const pending = {
    file: "backup.json",
    backup: {},
    summary: {
      exportedAt: "2026-09-30T10:00:00.000Z",
      schemaVersion: SCHEMA_HEAD,
      counts: {},
    },
    warnings: [],
  } as unknown as PickedBackup;

  /** The confirm as its callers hold it: busy from the click until the restore settles. */
  function Harness({ restore }: { restore: Promise<void> }) {
    const [restoring, setRestoring] = useState(false);
    return (
      <>
        <RestoreConfirm
          pending={pending}
          restoring={restoring}
          onCancel={() => undefined}
          onConfirm={() => {
            setRestoring(true);
            void restore.catch(() => undefined).then(() => setRestoring(false));
          }}
        />
        <button type="button">Elsewhere</button>
      </>
    );
  }

  const restoreButton = () =>
    screen.getByRole("button", {
      name: new RegExp(`^(${en.backup.restoreNow}|${en.backup.restoring})$`),
    });
  const cancel = () => screen.getByRole("button", { name: en.common.cancel });

  async function startRestore() {
    const restore = deferred<void>();
    render(<Harness restore={restore.promise} />);
    await userEvent.click(restoreButton());
    expect(restoreButton()).toHaveProperty("disabled", true);
    return restore;
  }

  it("puts focus on Cancel after the fixup dropped it to <body> (#549)", async () => {
    const restore = await startRestore();
    act(() => restoreButton().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => restore.reject(new Error("disk full")));
    expect(restoreButton()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(cancel());
  });

  it("leaves focus where the user moved it during the restore", async () => {
    const restore = await startRestore();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => restore.reject(new Error("disk full")));
    expect(restoreButton()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(elsewhere);
  });
});
