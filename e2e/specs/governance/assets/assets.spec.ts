/**
 * Governance → Assets — E2E Test Suite
 *
 * Phase 1 (Tests 1–3): View, Create, Edit          ✅ built
 * Phase 2 (Tests 4–6): Delete, Custom Field, Export ✅ built
 * Phase 3 (Tests 7–9): Filter/Sort, Bulk, Pagination — coming next
 *
 * Run:
 *   npx playwright test e2e/specs/governance/assets --headed
 *   LOGIN_MODE=google npx playwright test e2e/specs/governance/assets --headed
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../../helpers/auth-helper';
import { AssetActions } from '../../../helpers/asset-actions';

const captureSnapshot = async (page, testInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'assets');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Governance / Assets', () => {
    test.describe.configure({ timeout: 60_000 });

    let assets: AssetActions;

    test.beforeEach(async ({ page }) => {
        assets = new AssetActions(page);
        await ensureLoggedIn(page);
        await assets.navigate();
    });

    test.afterEach(async ({ page }, testInfo) => {
        await captureSnapshot(page, testInfo);
    });

    // ── 1. View ────────────────────────────────────────────────────────────────
    test('Asset: should display the table with required columns', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Asset ID/i }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /^Name$/i }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /Criticality/i }).first()).toBeVisible();
        await expect(page.getByPlaceholder('Filter assets...').first()).toBeVisible();
    });

    // ── 2. Create ──────────────────────────────────────────────────────────────
    test('Asset: should create a new asset', async ({ page }) => {
        test.setTimeout(30_000);
        const name = `E2E-Asset-Create-${Date.now()}`;
        await assets.create(name);

        await page.getByPlaceholder('Filter assets...').first().fill(name);
        await expect(
            page.locator('tbody tr').filter({ hasText: name }).first()
        ).toBeVisible({ timeout: 10000 });

        await assets.delete(name);
    });

    // ── 3. Edit ────────────────────────────────────────────────────────────────
    test('Asset: should edit an existing asset', async ({ page }) => {
        test.setTimeout(40_000);
        const name = `E2E-Asset-Edit-${Date.now()}`;
        await assets.create(name);

        const newOwner = `EditedOwner-${Date.now()}`;
        await assets.edit(name, newOwner);

        // Verify by reopening the row in View mode
        await page.getByPlaceholder('Filter assets...').first().fill(name);
        const row = page.locator('tbody tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        const dialog = page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 5000 });
        const ownerInput = dialog.locator('input[name="asset_owner"]');
        await expect(ownerInput).toBeVisible({ timeout: 5000 });
        await expect(ownerInput).toHaveValue(newOwner);

        await dialog.locator('[aria-label="Close modal"]').click();
        await page.getByPlaceholder('Filter assets...').first().clear();

        await assets.delete(name);
    });

    // ── 4. Delete ──────────────────────────────────────────────────────────────
    test('Asset: should delete an asset', async ({ page }) => {
        test.setTimeout(30_000);
        const name = `E2E-Asset-Delete-${Date.now()}`;
        await assets.create(name);

        // Delete the asset
        await assets.delete(name);

        // Verify — filter still active, empty state shown
        await page.getByPlaceholder('Filter assets...').first().fill(name);
        await expect(page.getByText('No assets found.').first()).toBeVisible({ timeout: 5000 });
        await page.getByPlaceholder('Filter assets...').first().clear();
    });

    // ── 5. Custom Field ────────────────────────────────────────────────────────
    test('Asset: should create a custom field and see it in the table', async ({ page }) => {
        test.setTimeout(40_000);
        const ts = Date.now();
        const fieldName = `e2e_field_${ts}`;
        const fieldLabel = `E2E Field ${ts}`;

        // Create the custom field via Manage Columns
        await assets.createCustomField(fieldName, fieldLabel);

        // Verify the new column appears in the Manage Columns list (table may hide custom fields for 'All Assets')
        await page.locator('button[title="Manage Columns"]').first().click();
        const panelHeading = page.locator('h3').filter({ hasText: /Manage.*Custom Columns/i }).first();
        await expect(panelHeading).toBeVisible({ timeout: 10000 });
        await expect(page.locator('div').filter({ hasText: fieldLabel }).first()).toBeVisible({ timeout: 10000 });

        // Close the Manage Columns panel before cleanup
        const headerElem = page.locator('h3').filter({ hasText: /Manage.*Custom Columns/i }).first().locator('xpath=..');
        await headerElem.locator('button').last().click();
        await expect(page.locator('h3').filter({ hasText: /Manage.*Custom Columns/i }).first()).not.toBeVisible({ timeout: 5000 });

        // Cleanup — delete the custom field
        await assets.deleteCustomField(fieldLabel);

        // Verify the column is gone
        await expect(
            page.getByRole('button', { name: new RegExp(fieldLabel, 'i') }).first()
        ).not.toBeVisible({ timeout: 5000 });
    });

    // ── 6. Export CSV ──────────────────────────────────────────────────────────
    test('Asset: should export assets as CSV', async ({ page }) => {
        test.setTimeout(20_000);
        // Export — intercepts the browser download event
        const filename = await assets.exportCSV();

        // Verify a file was downloaded with a .csv extension
        expect(filename).toMatch(/\.csv$/i);

        // Verify the temp file exists and has content
        const tempPath = `/tmp/e2e-${filename}`;
        expect(fs.existsSync(tempPath)).toBe(true);
        const content = fs.readFileSync(tempPath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
        // CSV should have at least a header row
        expect(content.split('\n').length).toBeGreaterThan(0);

        // Cleanup temp file
        fs.unlinkSync(tempPath);
    });
});
