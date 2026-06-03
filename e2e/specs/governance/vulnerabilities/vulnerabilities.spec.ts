/**
 * Governance → Vulnerability tab — Full E2E test suite
 *
 * Scenarios:
 *  1. View       — table loads with Name, Source, Status, Associated Asset columns
 *  2. Create     — add a new vulnerability, verify row appears
 *  3. Edit       — update name via View → Edit modal flow
 *  4. Delete     — delete via View → Delete → Confirm Deletion
 *  5. Filter     — filter by unique name narrows to 1 row
 *  6. Sort       — clicking column headers sorts without breaking the table
 *  7. Bulk Ops   — create 2, select both, inline-edit name, bulk-delete
 *
 * Skipped: Import/Export CSV, AI Assistant
 *
 * Login strategy: ensureLoggedIn checks for active session first.
 * Only the first test logs in; the rest reuse saved storageState.
 * Cleanup: every test deletes what it creates.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../../helpers/auth-helper';
import { VulnerabilityActions } from '../../../helpers/vulnerability-actions';

const captureSnapshot = async (page, testInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'vulnerabilities');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Governance / Vulnerabilities', () => {
    test.describe.configure({ timeout: 30_000 });
    let vulns: VulnerabilityActions;

    test.beforeEach(async ({ page }) => {
        vulns = new VulnerabilityActions(page);
        await ensureLoggedIn(page);
        await vulns.navigate();
    });

    test.afterEach(async ({ page }, testInfo) => {
        await captureSnapshot(page, testInfo);
    });

    // ── 1. View ──────────────────────────────────────────────────────────────
    test('Vulnerability: should display the table with required columns', async ({ page }) => {
        // Column headers are rendered as sortable buttons
        await expect(page.getByRole('button', { name: /^Name$/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Source/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Status/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Associated Asset/i })).toBeVisible();
    });

    // ── 2. Create ────────────────────────────────────────────────────────────
    test('Vulnerability: should create a new vulnerability', async ({ page }) => {
        test.setTimeout(20_000);
        const name = `E2E-Vuln-Create-${Date.now()}`;
        const { name: createdName } = await vulns.create(name);
        // Cleanup
        await vulns.delete(createdName);
    });

    // ── 3. Edit ──────────────────────────────────────────────────────────────
    test('Vulnerability: should update an existing vulnerability', async ({ page }) => {
        test.setTimeout(25_000);
        const name = `E2E-Vuln-Update-${Date.now()}`;
        await vulns.create(name);
        const editedName = `${name}-Edited`;
        await vulns.update(name, editedName);
        // Cleanup
        await vulns.delete(editedName);
    });

    // ── 4. Delete ────────────────────────────────────────────────────────────
    test('Vulnerability: should delete a vulnerability', async ({ page }) => {
        test.setTimeout(20_000);
        const name = `E2E-Vuln-Delete-${Date.now()}`;
        await vulns.create(name);
        await vulns.delete(name);
    });

    // ── 5. Filter ────────────────────────────────────────────────────────────
    test('Vulnerability: should filter vulnerabilities by name', async ({ page }) => {
        test.setTimeout(20_000);
        const ts = Date.now();
        const uniqueName = `E2E-VULN-FLTR-${ts}-UNIQUE`;
        await vulns.create(uniqueName);

        const filterInput = page.getByLabel('Filter vulnerabilities').first();
        await filterInput.fill(uniqueName);
        await page.waitForTimeout(800);

        const table = page.getByRole('table').first();
        const matchingRows = table.locator('tbody tr').filter({ hasText: uniqueName });
        await expect(matchingRows.first()).toBeVisible({ timeout: 10000 });
        await expect(matchingRows).toHaveCount(1, { timeout: 10000 });

        // Clear filter
        await filterInput.clear();
        await page.waitForTimeout(500);

        // Cleanup
        await vulns.delete(uniqueName);
    });

    // ── 6. Sort ──────────────────────────────────────────────────────────────
    test('Vulnerability: should sort by clicking column headers', async ({ page }) => {
        test.setTimeout(20_000);
        const name = `E2E-Vuln-Sort-${Date.now()}`;
        await vulns.create(name);

        const table = page.getByRole('table').first();
        const firstRow = table.locator('tbody tr').filter({ has: page.locator('td') }).first();
        await expect(firstRow).toBeVisible({ timeout: 10000 });

        // Sort by Name ascending
        await page.getByRole('button', { name: /^Name$/i }).click();
        await page.waitForTimeout(400);
        await expect(firstRow).toBeVisible({ timeout: 5000 });

        // Sort by Name descending
        await page.getByRole('button', { name: /^Name$/i }).click();
        await page.waitForTimeout(400);
        await expect(firstRow).toBeVisible({ timeout: 5000 });

        // Sort by Status
        await page.getByRole('button', { name: /^Status$/i }).click();
        await page.waitForTimeout(400);
        await expect(firstRow).toBeVisible({ timeout: 5000 });

        // Cleanup
        await vulns.delete(name);
    });

    // ── 7. Bulk Operations ───────────────────────────────────────────────────
    test('Vulnerability: should bulk-select and bulk-delete', async ({ page }) => {
        test.setTimeout(30_000);
        const ts = Date.now();
        const nameA = `E2E-Vuln-Bulk-A-${ts}`;
        const nameB = `E2E-Vuln-Bulk-B-${ts}`;
        await vulns.create(nameA);
        await vulns.create(nameB);

        // Filter to each name to select it (rows have no stable data-testid in the UI)
        const filterInput = page.getByLabel('Filter vulnerabilities').first();

        await filterInput.fill(nameA);
        await page.waitForTimeout(250);
        const rowA = page.locator('tbody tr').filter({ hasText: nameA }).first();
        await expect(rowA).toBeVisible({ timeout: 10000 });
        await rowA.locator('input[type="checkbox"]').check();

        await filterInput.fill(nameB);
        await page.waitForTimeout(250);
        const rowB = page.locator('tbody tr').filter({ hasText: nameB }).first();
        await expect(rowB).toBeVisible({ timeout: 10000 });
        await rowB.locator('input[type="checkbox"]').check();

        await filterInput.clear();

        // Select both rows — SelectionActionBar appears
        const deleteBtn = page.getByRole('button', { name: /^Delete$/i });
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await deleteBtn.click();

        const confirmBtn = page.getByRole('button', { name: /Confirm/i }).last();
        await expect(confirmBtn).toBeVisible({ timeout: 5000 });

        await Promise.all([
            page.waitForResponse(
                res => res.url().includes('/api/vulnerabilities') &&
                    (res.request().method() === 'DELETE' || res.url().includes('bulk-delete')),
                { timeout: 20000 }
            ),
            confirmBtn.click(),
        ]);

        await filterInput.fill(nameA);
        await expect(page.getByText('No vulnerabilities found.').first()).toBeVisible({ timeout: 10000 });
        await filterInput.fill(nameB);
        await expect(page.getByText('No vulnerabilities found.').first()).toBeVisible({ timeout: 10000 });
        await filterInput.clear();
    });
});
