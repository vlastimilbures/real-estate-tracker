import { test, expect, type Page } from "@playwright/test";

// End-to-end smoke test: boot the real React app (sql.js seed via VITE_E2E), edit a
// valuation through the actual UI, and confirm the Dashboard's "Net worth today" KPI
// reacts. This exercises the full DB → store → engine → UI data flow in a browser.

/** Read the "Net worth today" tile as a plain number (strip grouping/suffix). */
async function readNetWorth(page: Page): Promise<number> {
  const text = await page.getByTestId("kpi-networth").innerText();
  const n = Number(text.replace(/[^\d-]/g, ""));
  expect(
    Number.isFinite(n),
    `KPI text "${text}" parsed to a finite number`,
  ).toBe(true);
  return n;
}

test("editing a valuation moves the Dashboard net-worth KPI", async ({
  page,
}) => {
  await page.goto("/");

  // Wait out the loading screen + sql.js/wasm init.
  const kpi = page.getByTestId("kpi-networth");
  await expect(kpi).toBeVisible({ timeout: 30_000 });
  const before = await readNetWorth(page);

  // Drill into the first property from the keyboard: its name is a button (UX-022).
  await page.getByRole("button", { name: "Properties" }).click();
  await page.locator("table.data tbody tr td.left button").first().focus();
  await page.keyboard.press("Enter");

  // Scope to the Valuations panel, edit the in-force valuation to a large value.
  const valuations = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "Valuations" }) });
  await valuations.getByRole("button", { name: "Edit" }).first().click();

  const marketValue = valuations
    .locator(".field", { hasText: "Market value" })
    .locator("input");
  await marketValue.fill("99000000");
  await valuations.getByRole("button", { name: "Save changes" }).click();

  // Back to the Dashboard — equity (= value − debt) must have risen.
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(kpi).toBeVisible();
  await expect
    .poll(async () => readNetWorth(page), { timeout: 10_000 })
    .toBeGreaterThan(before);
});
