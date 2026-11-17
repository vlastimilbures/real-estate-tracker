// App-driving helpers for the screens: backups edited and restored, forced startup
// errors, loan events, property forms and the lens toggle. They drive the app through
// the UI and check each step took; the layout assertions live in layout/.
import path from "node:path";
import type { Locator } from "@playwright/test";
import {
  expect,
  boot,
  nav,
  openFirstProperty,
  panel,
  settingsTab,
  type Ux,
} from "./helpers";

// Resolved from the repo root (the cwd of `pnpm ux:capture`).
export const fixture = (name: string) =>
  path.resolve("ux-capture", "fixtures", name);

type BackupTables = Record<string, Record<string, unknown>[]>;

/**
 * Settings → Backup: exports the sample, edits the file to a legacy 60-year fixation and a
 * 150-year horizon, and picks it for restore (ADR 0148).
 */
export async function pickOutOfRangeBackup(ux: Ux) {
  await pickEditedBackup(ux, (tables) => {
    const [block] = tables.mortgage_blocks ?? [];
    const [assumptions] = tables.assumptions ?? [];
    if (!block || !assumptions) throw new Error("the sample has no mortgage");
    block.fixation_years = 60;
    assumptions.horizon_years = 150;
  });
}

/**
 * Settings → Backup: exports the sample, edits the file and picks it for restore. The
 * browser has no Tauri file dialog: the `open_backup_file` and `write_app_backup`
 * commands are answered the way the Rust side does, after boot (the database adapter
 * is chosen at boot).
 */
export async function chooseEditedBackup(
  ux: Ux,
  edit: (tables: BackupTables) => void,
) {
  await boot(ux.page);
  await settingsTab(ux, "backup");
  const download = ux.page.waitForEvent("download");
  await ux.page.getByRole("button", { name: ux.t.backup.exportButton }).click();
  const file = await (await download).path();
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(file, "utf8")) as {
    tables: BackupTables;
  };
  edit(backup.tables);
  await ux.page.evaluate((text) => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: (cmd: string) =>
        cmd === "open_backup_file"
          ? Promise.resolve({ name: "portfolio-backup-legacy.json", text })
          : cmd === "write_app_backup"
            ? Promise.resolve()
            : Promise.reject(new Error(`no ${cmd} in the browser`)),
    };
  }, JSON.stringify(backup));
  await ux.page.getByRole("button", { name: ux.t.backup.chooseFile }).click();
}

/** `chooseEditedBackup` up to the confirm step that asks to restore anyway. */
async function pickEditedBackup(ux: Ux, edit: (tables: BackupTables) => void) {
  await chooseEditedBackup(ux, edit);
  await expect(
    ux.page.getByRole("button", { name: ux.t.backup.restoreAnyway }),
  ).toBeVisible();
  // The export's toast would cover the confirm step.
  await expect(ux.page.getByText(ux.t.backup.downloaded)).toBeHidden();
}

/**
 * The startup error screen for a forced failure (ADR 0153): src/data/e2eFaults.ts reads
 * `sessionStorage["e2e.fault"]` in the browser E2E build, and the data layer then refuses
 * the database for real.
 */
export async function bootFailing(ux: Ux, fault: "DB_NEWER" | "ROW_INVALID") {
  await ux.page.addInitScript(
    (f) => sessionStorage.setItem("e2e.fault", f),
    fault,
  );
  await ux.page.goto("/");
  await expect(ux.page.locator(".error-screen")).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * ROW_INVALID, then Restore a backup… up to its confirm step. The backup is an export of
 * the sample, taken first in a normal start; the reload then starts with the fault. The
 * browser has no Tauri file dialog, so `open_backup_file` and `write_app_backup` are
 * answered the way the Rust side does.
 */
export async function bootRestoreConfirm(ux: Ux) {
  await boot(ux.page);
  await settingsTab(ux, "backup");
  const download = ux.page.waitForEvent("download");
  await ux.page.getByRole("button", { name: ux.t.backup.exportButton }).click();
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(await (await download).path(), "utf8");
  await ux.page.addInitScript(() =>
    sessionStorage.setItem("e2e.fault", "ROW_INVALID"),
  );
  await ux.page.reload();
  await expect(ux.page.locator(".error-screen")).toBeVisible({
    timeout: 30_000,
  });
  await ux.page.evaluate((json) => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: (cmd: string) =>
        cmd === "open_backup_file"
          ? Promise.resolve({ name: "portfolio-backup.json", text: json })
          : cmd === "write_app_backup"
            ? Promise.resolve()
            : Promise.reject(new Error(`no ${cmd} in the browser`)),
    };
  }, text);
  await ux.page.getByRole("button", { name: ux.t.boot.restoreBackup }).click();
  await expect(
    ux.page.getByRole("button", { name: ux.t.backup.restoreNow }),
  ).toBeVisible();
}

/**
 * Opens the first property's first mortgage block for editing and enters two
 * prepayments (the second larger than the balance) and a maturity change (ADR 0116).
 */
export async function enterLoanEvents(ux: Ux) {
  await boot(ux.page);
  await openFirstProperty(ux);
  const d = ux.t.propertyDetail;
  const p = panel(ux, d.mortgagesTitle);
  await p.getByRole("button", { name: ux.t.common.edit }).first().click();
  const add = p.getByRole("button", { name: d.eventAddPrepayment });
  const rows: [string, string][] = [
    ["17.01.2031", "500000"],
    ["17.01.2040", "5000000"],
  ];
  for (const [i, [date, amount]] of rows.entries()) {
    await add.click();
    const row = p.getByRole("group", { name: d.eventPrepaymentRow(i + 1) });
    await row.getByLabel(d.eventDate, { exact: true }).fill(date);
    await row.getByLabel(d.eventAmount).fill(amount);
  }
  await p
    .getByRole("group", { name: d.eventPrepaymentRow(1) })
    .getByLabel(d.eventFee)
    .fill("2000");
  await p.getByRole("button", { name: d.eventAddRecast }).click();
  const recast = p.getByRole("group", { name: d.eventRecastRow(1) });
  await recast.getByLabel(d.eventDate, { exact: true }).fill("17.01.2033");
  await recast.getByLabel(d.eventMaturity).fill("17.01.2045");
  return p;
}

/**
 * In the open property dialog, opens the Acquisition section and fills the given
 * funding fields (ADR 0119 §9).
 */
export async function fillFunding(
  ux: Ux,
  values: Partial<
    Record<
      "ownCash" | "transactionCosts" | "initialWorks" | "fundingNote",
      string
    >
  >,
) {
  const dialog = ux.page.getByRole("dialog");
  const f = ux.t.propertyForm;
  const toggle = dialog.getByRole("button", { name: f.acquisitionSection });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  for (const [key, value] of Object.entries(values)) {
    await dialog
      .getByLabel(f[key as keyof typeof values], { exact: true })
      .fill(value);
  }
  return dialog;
}

/** Pick a property-select dropdown's trigger and check focus moved into the list. */
export async function openDropdown(ux: Ux, trigger: Locator, focused: string) {
  await trigger.click();
  const list = ux.page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(list.getByRole("option", { name: focused })).toBeFocused();
}

/** Restores the sample as edited by `edit` (Settings → Backup), then the Dashboard. */
export async function restoreEdited(
  ux: Ux,
  edit: (tables: BackupTables) => void,
) {
  await chooseEditedBackup(ux, edit);
  await ux.page.getByRole("button", { name: ux.t.backup.restoreNow }).click();
  await expect(
    ux.page.getByRole("button", { name: ux.t.backup.chooseFile }),
  ).toBeVisible();
  // The export's toast would cover the panel.
  await expect(ux.page.getByText(ux.t.backup.downloaded)).toBeHidden();
  await nav(ux, "dashboard");
}

const rowsOf = (tables: BackupTables, name: string) => {
  const rows = tables[name];
  if (!rows) throw new Error(`the backup has no ${name}`);
  return rows;
};

/** Twenty properties with a loan each: the sample's three and 17 copies of the first,
 *  their loans started a few months apart (synthetic names only). */
export function twentyLoans(tables: BackupTables) {
  const properties = rowsOf(tables, "properties");
  const [first] = properties;
  if (!first) throw new Error("the sample has no property");
  const linked = ["valuations", "leases", "holding_costs", "mortgage_blocks"];
  const own = linked.map(
    (t) =>
      [t, rowsOf(tables, t).filter((r) => r.property_id === first.id)] as const,
  );
  for (let i = 1; i <= 17; i++) {
    const id = `ux-copy-${i}`;
    properties.push({
      ...first,
      id,
      name: `Byt Ukazkovy ${String(i).padStart(2, "0")}`,
    });
    for (const [t, rows] of own)
      for (const r of rows)
        rowsOf(tables, t).push({
          ...r,
          id: `${String(r.id)}-${i}`,
          property_id: id,
          ...(t === "mortgage_blocks"
            ? {
                start_date: `${2018 + (i % 8)}-${String(1 + ((i * 5) % 12)).padStart(2, "0")}-15`,
                prepayments: null,
                recasts: null,
              }
            : {}),
        });
  }
}

/** Byt Lipova's lease ends in the window with no next lease, and Byt Dubova's loan is a
 *  development loan with a draw and its completion ahead. */
export function devLoanAndLeaseEnd(tables: BackupTables) {
  const idOf = (name: string) => {
    const p = rowsOf(tables, "properties").find((x) => x.name === name);
    if (!p) throw new Error(`the sample has no ${name}`);
    return p.id;
  };
  const lipova = idOf("Byt Lipova");
  const leases = rowsOf(tables, "leases")
    .filter((l) => l.property_id === lipova)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  const [current, next] = leases;
  if (!current || !next) throw new Error("Byt Lipova has no follow-on lease");
  tables.leases = rowsOf(tables, "leases").filter((l) => l !== next);
  current.end_date = "2027-06-30";
  const dubova = idOf("Byt Dubova");
  const block = rowsOf(tables, "mortgage_blocks").find(
    (b) => b.property_id === dubova,
  );
  if (!block) throw new Error("Byt Dubova has no loan");
  block.loan_term_years = 30;
  block.draws = JSON.stringify([{ date: "2027-03-01", amount: "500000" }]);
  block.interest_only_until = "2027-09-30";
}

/** Property detail of the first property: its first loan becomes a development loan with
 *  a tranche drawn and one ahead (ADR 0167), saved. */
export async function firstLoanToDevelopment(ux: Ux) {
  const d = ux.t.propertyDetail;
  await boot(ux.page);
  await openFirstProperty(ux);
  const m = panel(ux, d.mortgagesTitle);
  await m.getByRole("button", { name: ux.t.common.edit }).first().click();
  await m.getByRole("button", { name: d.loanTypeDevelopment }).click();
  await m.getByLabel(d.fieldLoanTermYears, { exact: false }).fill("30");
  const schedule = m.getByRole("group", { name: d.fieldDraws });
  const tranches: [string, string][] = [
    ["01.09.2024", "400000"],
    ["01.03.2027", "500000"],
  ];
  for (const [i, [date, amount]] of tranches.entries()) {
    await schedule.getByRole("button", { name: d.addTranche }).click();
    const row = schedule.getByRole("group", { name: d.trancheRow(i + 1) });
    await row.getByLabel(d.eventDate, { exact: true }).fill(date);
    await row.getByLabel(d.eventAmount).fill(amount);
  }
  await m.getByRole("button", { name: ux.t.common.saveChanges }).click();
}

/** Owned properties added until Properties lists six: past five, the property selectors
 *  become dropdowns. */
export async function addPropertiesToSix(ux: Ux) {
  await nav(ux, "properties");
  const rows = ux.page.locator("table.data tbody tr");
  const f = ux.t.propertyForm;
  for (let n = await rows.count(); n < 6; n++) {
    await ux.page
      .getByRole("button", { name: ux.t.properties.addProperty })
      .click();
    const dialog = ux.page.getByRole("dialog");
    await dialog.getByLabel(f.name, { exact: true }).fill(`Byt Nový ${n + 1}`);
    await dialog.getByLabel(f.purchaseDate, { exact: true }).fill("01.02.2024");
    await dialog.getByLabel(f.purchasePrice, { exact: true }).fill("4500000");
    await dialog
      .locator(".modal-foot")
      .getByRole("button", { name: f.addTitle })
      .click();
    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(n + 1);
  }
}

/** Saves the open property dialog and waits for it to close. */
export async function saveProperty(ux: Ux) {
  const dialog = ux.page.getByRole("dialog");
  await dialog
    .locator(".modal-foot")
    .getByRole("button", { name: ux.t.common.saveChanges })
    .click();
  await expect(dialog).toBeHidden();
}

/** Topbar lens toggle → Real, and check it took (#137). */
export async function pickReal(ux: Ux) {
  const real = ux.page
    .getByRole("group", { name: ux.t.shell.nominalOrReal })
    .getByRole("button", { name: ux.t.common.real, exact: true });
  await real.click();
  await expect(real).toHaveAttribute("aria-pressed", "true");
}
