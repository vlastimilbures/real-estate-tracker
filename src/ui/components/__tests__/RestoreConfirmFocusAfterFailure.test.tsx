// @vitest-environment jsdom
//
// ADR 0248 §1 (#549): the Restore confirm disables its buttons while the restore runs,
// which drops focus to <body>. After a failed restore focus goes to Cancel, unless the
// user moved it. Settings → Backup and the startup error screen share this confirm.
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestoreConfirm } from "../RestoreConfirm";
import { SCHEMA_HEAD, type PickedBackup } from "../../../state/backup";
import { deferred } from "../../../__tests__/support/deferred";
import { en } from "../../../i18n/en";

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

describe("Restore confirm focus after a failure (ADR 0248 §1)", () => {
  it.fails(
    "puts focus on Cancel after the fixup dropped it to <body> (#549)",
    async () => {
      const restore = await startRestore();
      act(() => restoreButton().blur());
      expect(document.activeElement).toBe(document.body);
      await act(async () => restore.reject(new Error("disk full")));
      expect(restoreButton()).toHaveProperty("disabled", false);
      expect(document.activeElement).toBe(cancel());
    },
  );

  it("leaves focus where the user moved it during the restore", async () => {
    const restore = await startRestore();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    act(() => elsewhere.focus());
    await act(async () => restore.reject(new Error("disk full")));
    expect(restoreButton()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(elsewhere);
  });
});
