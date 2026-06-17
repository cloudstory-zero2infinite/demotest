/**
 * Dashboard — Interactive Features Suite
 *
 * Covers all user interactions on the dashboard (filters, time-range buttons,
 * expand-to-modal, cross-tab navigation).
 *
 *  1.  Assets filter         — criticality dropdown changes without breaking card
 *  2.  Scoring Trend         — 1M / 1Q / 1Y buttons clickable without crash
 *  3.  Controls Coverage expand — opens modal with heading, close works
 *  4.  Policy Status expand  — opens modal with heading, close works
 *  5.  Security Score expand — expand button opens modal, close works
 *  6.  Scoring Trend range   — clicked range button gets the active style (bg-gray-100)
 *  7.  Data Integrity expand — opens modal with heading, close works
 *  8.  Cross-tab navigation  — navigating away to Program and back keeps Security Score visible
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { DashboardActions } from '../../helpers/dashboard-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'dashboard-interactive');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Dashboard / Interactive', () => {
    test.describe.configure({ timeout: 60_000 });

    let dashboard: DashboardActions;

    test.beforeEach(async ({ page }) => {
        dashboard = new DashboardActions(page);
        await ensureLoggedIn(page);
        await dashboard.navigate();
    });

    test.afterEach(async ({ page }, testInfo) => {
        await captureSnapshot(page, testInfo);
    });

    // ── 1. Assets criticality filter ─────────────────────────────────────────
    test('Dashboard Interactive: Assets card criticality filter should change without error', async ({ page }) => {
        const select = page.locator('select').filter({ has: page.locator('option[value="High"]') }).first();
        await expect(select).toBeVisible({ timeout: 5000 });

        await select.selectOption('High');
        await expect(page.getByText('Assets').first()).toBeVisible();

        await select.selectOption('All');
        await expect(page.getByText('Governed').first()).toBeVisible();
    });

    // ── 2. Scoring Trend time-range buttons ───────────────────────────────────
    test('Dashboard Interactive: Scoring Trend time-range buttons should all be clickable', async ({ page }) => {
        await expect(page.getByText('Scoring Trend').first()).toBeVisible();

        for (const label of ['1M', '1Q', '1Y']) {
            const btn = page.getByRole('button', { name: label }).first();
            await expect(btn).toBeVisible({ timeout: 5000 });
            await btn.click();
            await expect(page.getByText('Scoring Trend').first()).toBeVisible();
        }
    });

    // ── 3. Controls Coverage expand ───────────────────────────────────────────
    test('Dashboard Interactive: Controls Coverage expand should open modal and close', async ({ page }) => {
        test.setTimeout(30_000);

        await dashboard.expandCard('Controls Coverage');
        const modal = page.locator('.fixed.inset-0').last();
        await expect(modal).toBeVisible({ timeout: 8000 });
        await expect(modal.getByText(/Controls Coverage/i)).toBeVisible();

        await dashboard.closeExpandedModal();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    });

    // ── 4. Policy Status expand ───────────────────────────────────────────────
    test('Dashboard Interactive: Policy Status expand should open modal and close', async ({ page }) => {
        test.setTimeout(30_000);

        await dashboard.expandCard('Policy Status');
        const modal = page.locator('.fixed.inset-0').last();
        await expect(modal).toBeVisible({ timeout: 8000 });
        await expect(modal.getByText(/Policy Status/i)).toBeVisible();

        await dashboard.closeExpandedModal();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    });

    // ── 5. Security Score expand ──────────────────────────────────────────────
    test('Dashboard Interactive: Security Score card should have an expand button', async ({ page }) => {
        const scoreCard = page.locator('h3').filter({ hasText: 'Security Score' }).first()
            .locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
        const expandBtn = scoreCard.locator('button[aria-label="Expand chart"]').first();
        await expect(expandBtn).toBeVisible({ timeout: 5000 });

        await expandBtn.click();
        const modal = page.locator('.fixed.inset-0').last();
        await expect(modal).toBeVisible({ timeout: 8000 });
        await expect(modal.getByRole('heading', { name: /Security Score/i })).toBeVisible();

        await dashboard.closeExpandedModal();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    });

    // ── 6. Scoring Trend: clicked range gets active style ─────────────────────
    // Clicking a range button applies `bg-gray-100` to highlight the active selection.
    test('Dashboard Interactive: Scoring Trend clicked range button should get active highlight class', async ({ page }) => {
        await expect(page.getByText('Scoring Trend').first()).toBeVisible();

        const btn1Q = page.getByRole('button', { name: '1Q' }).first();
        await btn1Q.click();
        await page.waitForTimeout(300);

        const cls = await btn1Q.getAttribute('class');
        expect(cls).toContain('bg-gray-100');

        // Other buttons should not have the active class
        const btn1M = page.getByRole('button', { name: '1M' }).first();
        const cls1M = await btn1M.getAttribute('class');
        expect(cls1M).not.toContain('bg-gray-100');
    });

    // ── 7. Data Integrity expand ──────────────────────────────────────────────
    test('Dashboard Interactive: Data Integrity expand should open modal and close', async ({ page }) => {
        test.setTimeout(30_000);

        await dashboard.expandCard('Data Integrity');
        const modal = page.locator('.fixed.inset-0').last();
        await expect(modal).toBeVisible({ timeout: 8000 });
        await expect(modal.getByRole('heading', { name: /Data Integrity/i })).toBeVisible();

        await dashboard.closeExpandedModal();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    });

    // ── 8. Cross-tab navigation ───────────────────────────────────────────────
    // Navigating away to Program and returning should re-render the dashboard correctly.
    test('Dashboard Interactive: navigating to Program and back should restore Security Score', async ({ page }) => {
        await expect(page.getByText('Security Score').first()).toBeVisible();

        // Navigate to Program tab
        await page.getByRole('button', { name: /Program/i }).click();
        await expect(page.getByText('Program Tracker').first()).toBeVisible({ timeout: 15000 });

        // Navigate back to Dashboard
        await dashboard.navigate();
        await expect(page.getByText('Security Score').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Loading Dashboard Data...')).not.toBeVisible();
    });
});
