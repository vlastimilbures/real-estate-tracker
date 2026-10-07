// @vitest-environment jsdom
//
// ADR 0149 (#119): the restore confirm step dates the backup by the local calendar day of
// `exportedAt`, like its file name and the "Last backup" line. The file runs in Prague
// time whatever zone the suite runs in, so 00:30 local is the previous day in UTC.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { BackupRestorePanel } from "../BackupRestore";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import { exportToJson } from "../../../data/backup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const suiteTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Prague";
});
afterAll(() => {
  // Assigning undefined would store the string "undefined" (UTC), not unset it.
  if (suiteTz === undefined) delete process.env.TZ;
  else process.env.TZ = suiteTz;
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  act(() => {
    useUiStore.setState({ language: "en" });
    usePortfolioStore.setState({
      status: "ready",
      portfolio,
      assumptions,
      sample: { active: false, dismissed: false },
    } as never);
  });
});

it("shows the local day of a backup made at 00:30 (#119)", async () => {
  const exportedAt = new Date(2026, 9, 3, 0, 30); // 03.10.2026 00:30 Prague
  expect(exportedAt.toISOString()).toBe("2026-10-02T22:30:00.000Z");
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  const backup = await exportToJson(sql);
  sql.db.close();
  const text = JSON.stringify({
    ...backup,
    exportedAt: exportedAt.toISOString(),
  });
  vi.mocked(invoke).mockResolvedValue({ name: "b.json", text });
  render(<BackupRestorePanel />);

  await userEvent.click(
    screen.getByRole("button", { name: en.backup.chooseFile }),
  );

  expect(
    await screen.findByText(en.backup.backupDate("03.10.2026")),
  ).toBeTruthy();
});
