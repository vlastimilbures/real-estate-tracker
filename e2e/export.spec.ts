import { test, expect } from "@playwright/test";

// Exercises the real export path in a browser: Vite resolves the exceljs browser bundle,
// the dynamic import runs, exceljs.writeBuffer() produces a Blob, and downloadBlob fires a
// download. This is the one thing unit tests and the build can't prove.

test("Projections export icon downloads an .xlsx", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("kpi-networth")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Projections" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Excel" }).first().click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /-projection-(nominal|real)\.xlsx$/,
  );
  // The click surfaces a confirmation toast naming the saved file.
  await expect(
    page.getByText(/Exported .*-projection-(nominal|real)\.xlsx/),
  ).toBeVisible();
});

test("Property detail amortization export downloads an .xlsx", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("kpi-networth")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Properties" }).click();
  await page.locator("table.data tbody tr td.left").first().click();

  // The amortization panel's export button (the second export icon on the page).
  const amortPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "Amortization schedule" }),
  });

  const downloadPromise = page.waitForEvent("download");
  await amortPanel.getByRole("button", { name: "Export to Excel" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/-amortization\.xlsx$/);
  await expect(page.getByText(/Exported .*-amortization\.xlsx/)).toBeVisible();
});
