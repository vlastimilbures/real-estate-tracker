// Startup: the loading screen, startup errors and Restore a backup from them.
import { bootFailing, bootRestoreConfirm } from "../flows";
import { expect } from "../helpers";
import { defineScreen, type Screen } from "./define";

export const bootScreens: Screen[] = [
  defineScreen(
    "00-loading",
    "Startup loading screen (sql.js init delayed)",
    async (ux) => {
      // Hold the wasm download so the loading screen stays up long enough to capture.
      await ux.page.route("**/*.wasm*", async (r) => {
        await new Promise((res) => setTimeout(res, 4000));
        await r.continue();
      });
      await ux.page.goto("/");
      await expect(ux.page.locator(".loading-screen")).toBeVisible();
      await ux.capture();
    },
  ),
  defineScreen(
    "00b-boot-row-invalid",
    "Startup error: an unreadable record (Restore a backup…, records involved)",
    async (ux) => {
      await bootFailing(ux, "ROW_INVALID");
      await ux.capture();
    },
  ),
  defineScreen(
    "00c-boot-db-newer",
    "Startup error: a database from a newer app (details, no Try again)",
    async (ux) => {
      await bootFailing(ux, "DB_NEWER");
      await ux.capture();
    },
  ),
  defineScreen(
    "00d-boot-restore-confirm",
    "Startup error: Restore a backup… at its confirm step",
    async (ux) => {
      await bootRestoreConfirm(ux);
      await ux.capture();
    },
  ),
  defineScreen(
    "00e-boot-restored",
    "Startup error: restored, the safety copy named, Open the app",
    async (ux) => {
      await bootRestoreConfirm(ux);
      await ux.page
        .getByRole("button", { name: ux.t.backup.restoreNow })
        .click();
      await expect(
        ux.page.getByRole("button", { name: ux.t.boot.continue }),
      ).toBeVisible();
      await ux.capture();
    },
  ),
  defineScreen(
    "00f-boot-restored-app",
    "After Continue: the app keeps naming the safety copy until dismissed (ADR 0154)",
    async (ux) => {
      await bootRestoreConfirm(ux);
      await ux.page
        .getByRole("button", { name: ux.t.backup.restoreNow })
        .click();
      await ux.page.getByRole("button", { name: ux.t.boot.continue }).click();
      await expect(
        ux.page.getByText(/portfolio-before-restore-.*\.json/),
      ).toBeVisible();
      await ux.capture({ fullPage: false });
    },
  ),
];
