// @vitest-environment jsdom
//
// #451 (ADR 0231): a stored scenario row the app cannot read stops startup like an invalid
// row in any other table. The screen offers Restore a backup… and no Try again, names the
// scenario under "Records involved", and a good backup restored there opens the app.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BootFailure } from "../components/BootFailure";
import { usePortfolioStore, portfolioDb } from "../../state/portfolioStore";
import { en } from "../../i18n/en";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { exportToJson } from "../../data/backup";
import { invoke } from "@tauri-apps/api/core";

const picked = { text: "" };
vi.mocked(invoke).mockImplementation((command: string) =>
  command === "open_backup_file"
    ? Promise.resolve({ name: "portfolio-backup.json", text: picked.text })
    : Promise.resolve(),
);

let db: TestSql;
const store = () => usePortfolioStore.getState();
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(async () => {
  db = openMemorySql();
  await migrate(db);
  await seedIfEmpty(db);
  picked.text = JSON.stringify(await exportToJson(db, new Date()));
  // Valid JSON (passes the CHECK) that the overrides reader refuses.
  await db.execute(
    "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, ?)",
    [
      "bad",
      "Broken",
      '{"version":1,"valueShock":{"pct":"x"}}',
      "2026-01-01T00:00:00.000Z",
    ],
  );
  await act(() => store().init(async () => db));
});

describe("an unreadable scenario row at startup (#451, ADR 0231)", () => {
  it("stops startup on SCENARIO_INVALID, with the database kept open", () => {
    expect(store().status).toBe("error");
    expect(store().startupError?.code).toBe("SCENARIO_INVALID");
    expect(portfolioDb.get()).toBe(db);
  });

  it("offers Restore a backup… and names the scenario, not Try again", () => {
    render(<BootFailure />);
    const alert = screen.getByRole("alert").textContent;
    expect(alert).toContain(en.dataErrors.SCENARIO_INVALID);
    expect(alert).toContain(en.boot.nextRowInvalid);
    expect(alert).toContain(en.dataErrors.detailsHeading);
    expect(alert).toContain('scenario "Broken"');
    expect(button(en.boot.restoreBackup)).toBeDefined();
    expect(screen.queryByRole("button", { name: en.app.tryAgain })).toBeNull();
  });

  it("restoring a good backup from the screen opens the app", async () => {
    render(<BootFailure />);
    await userEvent.click(button(en.boot.restoreBackup));
    await userEvent.click(button(en.backup.restoreNow));
    expect(screen.getByRole("alert").textContent).toMatch(
      /portfolio-before-restore-.*\.json/,
    );

    await userEvent.click(button(en.boot.continue));
    expect(store().status).toBe("ready");
    expect(store().startupError).toBeNull();
    expect(store().portfolio!.properties.length).toBeGreaterThan(0);
    expect(store().scenarios.map((s) => s.id)).not.toContain("bad");
  });
});
