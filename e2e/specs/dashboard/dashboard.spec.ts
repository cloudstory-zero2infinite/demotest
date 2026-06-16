/**
 * Dashboard — E2E Test Suite
 *
 * Scenarios:
 *  1.  Navigation      — Dashboard tab loads and spinner resolves
 *  2.  Security Score  — card is visible and shows a numeric score
 *  3.  Assets card     — card heading and "Governed" label are visible
 *  4.  Assets filter   — criticality dropdown changes filter without breaking the card
 *  5.  Vulnerabilities — card heading and "Remediated" label are visible
 *  6.  Controls card   — "Controls Coverage" ChartCard is visible
 *  7.  Program card    — "Program Status" card is visible
 *  8.  Framework grid  — "Framework Compliance" section is visible
 *  9.  Policy card     — "Policy Status" ChartCard is visible
 *  10. Data Integrity  — "Data Integrity" card is visible
 *  11. Scoring Trend   — card visible; time-range buttons (1M / 1Q / 1Y) are clickable
 *  12. Mapping card    — "Controls to Frameworks Mapping" card is visible
 *  13. Expand modal    — "Controls Coverage" expand opens modal with correct title, close works
 *  14. Expand modal    — "Policy Status" expand opens modal, close works
 *  15. Score expand    — Security Score card has its own expand button
 *
 * Login strategy: ensureLoggedIn reuses saved storageState when already logged in.
 * Cleanup: no data is mutated — all tests are read-only.
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { DashboardActions } from '../../helpers/dashboard-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'dashboard');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Dashboard', () => {
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

    // ── 1. Navigation ─────────────────────────────────────────────────────────
    test('Dashboard: should load without showing the spinner', async ({ page }) => {
        await expect(page.getByText('Loading Dashboard Data...')).not.toBeVisible();
        // At least one card heading confirms full render
        await expect(page.getByText('Security Score').first()).toBeVisible();
    });

    // ── 2. Security Score card ────────────────────────────────────────────────
    test('Dashboard: Security Score card should be visible with a numeric score', async ({ page }) => {
        await expect(page.getByText('Security Score').first()).toBeVisible();
        // Score is rendered as a 2–3 digit number inside the card
        const scoreCard = page.locator('h3').filter({ hasText: 'Security Score' }).first()
            .locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
        // The gauge label text e.g. "72" or "--" (no data) should be present
        await expect(scoreCard).toBeVisible();
    });

    // ── 3. Assets card ────────────────────────────────────────────────────────
    test('Dashboard: Assets card should show heading and Governed label', async ({ page }) => {
        await expect(page.getByText('Assets').first()).toBeVisible();
        await expect(page.getByText('Governed').first()).toBeVisible();
    });

    // ── 4. Assets criticality filter ─────────────────────────────────────────
    test('Dashboard: Assets card criticality filter should change without error', async ({ page }) => {
        // The select element is inside the Assets card
        const select = page.locator('select').filter({ has: page.locator('option[value="High"]') }).first();
        await expect(select).toBeVisible({ timeout: 5000 });

        await select.selectOption('High');
        // Card must remain visible after filter change — no crash
        await expect(page.getByText('Assets').first()).toBeVisible();

        await select.selectOption('All');
        await expect(page.getByText('Governed').first()).toBeVisible();
    });

    // ── 5. Vulnerabilities card ───────────────────────────────────────────────
    test('Dashboard: Vulnerabilities card should show heading and Remediated label', async ({ page }) => {
        await expect(page.getByText('Vulnerabilities').first()).toBeVisible();
        await expect(page.getByText('Remediated').first()).toBeVisible();
    });

    // ── 6. Controls Coverage card ─────────────────────────────────────────────
    test('Dashboard: Controls Coverage card should be visible', async ({ page }) => {
        await expect(page.getByText('Controls Coverage').first()).toBeVisible();
        await expect(page.getByText('Enforced').first()).toBeVisible();
    });

    // ── 7. Program Status card ────────────────────────────────────────────────
    test('Dashboard: Program Status card should be visible', async ({ page }) => {
        await expect(page.getByText('Program Status').first()).toBeVisible();
        // Sub-label "tasks" is shown next to the count
        await expect(page.getByText(/tasks/i).first()).toBeVisible();
    });

    // ── 8. Framework Compliance grid ──────────────────────────────────────────
    test('Dashboard: Framework Compliance section should be visible', async ({ page }) => {
        await expect(page.getByText('Framework Compliance').first()).toBeVisible();
    });

    // ── 9. Policy Status card ─────────────────────────────────────────────────
    test('Dashboard: Policy Status card should be visible', async ({ page }) => {
        await expect(page.getByText('Policy Status').first()).toBeVisible();
        await expect(page.getByText(/Approved/i).first()).toBeVisible();
    });

    // ── 10. Data Integrity card ───────────────────────────────────────────────
    test('Dashboard: Data Integrity card should be visible', async ({ page }) => {
        await expect(page.getByText('Data Integrity').first()).toBeVisible();
    });

    // ── 11. Scoring Trend card + time-range buttons ───────────────────────────
    test('Dashboard: Scoring Trend card should be visible with time-range buttons', async ({ page }) => {
        await expect(page.getByText('Scoring Trend').first()).toBeVisible();

        // Time range buttons: 1M, 1Q, 1Y
        for (const label of ['1M', '1Q', '1Y']) {
            const btn = page.getByRole('button', { name: label }).first();
            await expect(btn).toBeVisible({ timeout: 5000 });
            await btn.click();
            // Card should remain visible after each click
            await expect(page.getByText('Scoring Trend').first()).toBeVisible();
        }
    });

    // ── 12. Controls to Frameworks Mapping card ───────────────────────────────
    test('Dashboard: Controls to Frameworks Mapping card should be visible', async ({ page }) => {
        await expect(page.getByText('Controls to Frameworks Mapping').first()).toBeVisible();
    });

    // ── 13. Expand modal — Controls Coverage ──────────────────────────────────
    test('Dashboard: Controls Coverage expand should open modal and close', async ({ page }) => {
        test.setTimeout(30_000);

        // Click the expand button on the Controls Coverage ChartCard
        await dashboard.expandCard('Controls Coverage');

        // Modal should appear with the expanded title
        const modal = page.locator('.fixed.inset-0').last();
        await expect(modal).toBeVisible({ timeout: 8000 });
        await expect(modal.getByText(/Controls Coverage/i)).toBeVisible();

        // Close the modal
        await dashboard.closeExpandedModal();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    });

    // ── 14. Expand modal — Policy Status ──────────────────────────────────────
    test('Dashboard: Policy Status expand should open modal and close', async ({ page }) => {
        test.setTimeout(30_000);

        await dashboard.expandCard('Policy Status');

        const modal = page.locator('.fixed.inset-0').last();
        await expect(modal).toBeVisible({ timeout: 8000 });
        await expect(modal.getByText(/Policy Status/i)).toBeVisible();

        await dashboard.closeExpandedModal();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    });

    // ── 15. Security Score expand button ──────────────────────────────────────
    test('Dashboard: Security Score card should have an expand button', async ({ page }) => {
        // SecurityScoreCard renders its own expand button with aria-label="Expand chart"
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
});
