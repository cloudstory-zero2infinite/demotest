/**
 * Risk Management → Risk Registry — E2E Test Suite
 *
 * Scenarios:
 *  1. View        — page loads with "Risk Registry" heading and summary cards
 *  2. Summary     — four level cards (Critical, High, Medium, Low) are visible
 *  3. Create      — add a manual risk, verify row appears with "Manual" badge
 *  4. Edit        — edit a manual risk name via the pencil button
 *  5. Delete      — delete a manual risk via trash button + confirm dialog
 *  6. Level filter — clicking a summary card filters the table to that level
 *  7. Compute     — "Compute Risk" button is visible and clickable
 *
 * Skipped: AI-computed risks (requires full control setup), grouping filter
 * (depends on pre-existing data), NIST CSF field (optional free-text).
 *
 * Login strategy: ensureLoggedIn checks for active session first.
 * Cleanup: every test deletes what it creates.
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { RiskActions } from '../../helpers/risk-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'risk');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Risk Management / Risk Registry', () => {
    test.describe.configure({ timeout: 60_000 });

    let risk: RiskActions;

    test.beforeEach(async ({ page }) => {
        risk = new RiskActions(page);
        await ensureLoggedIn(page);
        await risk.navigate();
    });

    test.afterEach(async ({ page }, testInfo) => {
        await captureSnapshot(page, testInfo);
    });

    // ── 1. View ───────────────────────────────────────────────────────────────
    test('Risk Registry: should display the Risk Registry heading', async ({ page }) => {
        await expect(page.getByText('Risk Registry').first()).toBeVisible();
        await expect(page.getByText(/Inherent.*residual risk/i)).toBeVisible();
    });

    // ── 2. Summary cards ─────────────────────────────────────────────────────
    test('Risk Registry: should display four residual level summary cards', async ({ page }) => {
        for (const level of ['Critical', 'High', 'Medium', 'Low']) {
            await expect(page.getByText(`${level} residual`)).toBeVisible();
        }
    });

    // ── 3. Create ─────────────────────────────────────────────────────────────
    test('Risk Registry: should add a manual risk and show Manual badge', async ({ page }) => {
        test.setTimeout(30_000);
        const name = `E2E-Risk-Create-${Date.now()}`;
        await risk.create(name, { grouping: 'E2E Group', inherentLevel: 'High', residualLevel: 'Low' });

        // Verify "Manual" badge appears on the row
        const row = page.locator('tr').filter({ hasText: name }).first();
        await expect(row.getByText('Manual')).toBeVisible({ timeout: 5000 });

        // Cleanup
        await risk.delete(name);
    });

    // ── 4. Edit ───────────────────────────────────────────────────────────────
    test('Risk Registry: should edit a manual risk name', async ({ page }) => {
        test.setTimeout(40_000);
        const name = `E2E-Risk-Edit-${Date.now()}`;
        await risk.create(name);
        const edited = `${name}-Edited`;
        await risk.update(name, edited);

        // Verify updated name visible
        await expect(page.locator('td').filter({ hasText: edited }).first()).toBeVisible({ timeout: 10000 });

        // Cleanup
        await risk.delete(edited);
    });

    // ── 5. Delete ─────────────────────────────────────────────────────────────
    test('Risk Registry: should delete a manual risk', async ({ page }) => {
        test.setTimeout(30_000);
        const name = `E2E-Risk-Delete-${Date.now()}`;
        await risk.create(name);
        await risk.delete(name);

        // Verify gone
        await expect(page.locator('tr').filter({ hasText: name })).toHaveCount(0, { timeout: 10000 });
    });

    // ── 6. Level filter ───────────────────────────────────────────────────────
    test('Risk Registry: clicking a level card should filter the table', async ({ page }) => {
        test.setTimeout(30_000);
        // Create a Low residual risk so we have at least one filterable item
        const name = `E2E-Risk-Filter-${Date.now()}`;
        await risk.create(name, { residualLevel: 'Low' });

        // Click the "Low" summary card
        await page.getByText('Low residual').click();
        await page.waitForTimeout(300);

        // The filter count text should show a subset
        const countText = page.locator('text=/\\d+ of \\d+ risks/');
        await expect(countText).toBeVisible({ timeout: 5000 });

        // The created risk should still be visible
        await expect(page.locator('tr').filter({ hasText: name }).first()).toBeVisible({ timeout: 5000 });

        // Click again to deselect (toggle off)
        await page.getByText('Low residual').click();

        // Cleanup
        await risk.delete(name);
    });

    // ── 7. Compute Risk button ────────────────────────────────────────────────
    test('Risk Registry: Compute Risk button should be visible and trigger API call', async ({ page }) => {
        // Use evaluate() to find the visible Compute Risk button (avoids hidden-tab duplicates)
        const visible = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b => {
                const rect = b.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && b.textContent?.trim().includes('Compute Risk');
            });
            return !!btn;
        });
        expect(visible).toBe(true);

        // Click it and verify an API call goes out
        const [response] = await Promise.all([
            page.waitForResponse(
                res => res.url().includes('/api/risk') && res.request().method() === 'POST',
                { timeout: 20000 }
            ),
            page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => {
                    const rect = b.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && b.textContent?.trim().includes('Compute Risk');
                });
                if (btn) (btn as HTMLButtonElement).click();
            }),
        ]);
        expect(response.status()).toBeLessThan(300);
    });
});
