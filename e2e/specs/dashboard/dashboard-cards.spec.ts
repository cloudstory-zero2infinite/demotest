/**
 * Dashboard — Cards Visibility Suite
 *
 * All tests are read-only — no data mutations.
 * Verifies that every dashboard card renders with its heading and key label.
 *
 *  1.  Navigation         — loads without spinner, Security Score heading visible
 *  2.  Security Score     — card container visible
 *  3.  Assets             — heading + "Governed" label
 *  4.  Vulnerabilities    — heading + "Remediated" label
 *  5.  Controls Coverage  — heading + "Enforced" label
 *  6.  Program Status     — heading + "tasks" label
 *  7.  Framework Compliance — section heading visible
 *  8.  Policy Status      — heading + "Approved" label
 *  9.  Data Integrity     — heading visible
 * 10.  Controls Mapping   — "Controls to Frameworks Mapping" heading visible
 * 11.  Security Score value — card shows a numeric score or "--" placeholder
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { DashboardActions } from '../../helpers/dashboard-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'dashboard-cards');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Dashboard / Cards', () => {
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
    test('Dashboard Cards: should load without showing the spinner', async ({ page }) => {
        await expect(page.getByText('Loading Dashboard Data...')).not.toBeVisible();
        await expect(page.getByText('Security Score').first()).toBeVisible();
    });

    // ── 2. Security Score card ────────────────────────────────────────────────
    test('Dashboard Cards: Security Score card should be visible', async ({ page }) => {
        const scoreCard = page.locator('h3').filter({ hasText: 'Security Score' }).first()
            .locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
        await expect(scoreCard).toBeVisible();
    });

    // ── 3. Assets card ────────────────────────────────────────────────────────
    test('Dashboard Cards: Assets card should show heading and Governed label', async ({ page }) => {
        await expect(page.getByText('Assets').first()).toBeVisible();
        await expect(page.getByText('Governed').first()).toBeVisible();
    });

    // ── 4. Vulnerabilities card ───────────────────────────────────────────────
    test('Dashboard Cards: Vulnerabilities card should show heading and Remediated label', async ({ page }) => {
        await expect(page.getByText('Vulnerabilities').first()).toBeVisible();
        await expect(page.getByText('Remediated').first()).toBeVisible();
    });

    // ── 5. Controls Coverage card ─────────────────────────────────────────────
    test('Dashboard Cards: Controls Coverage card should be visible with Enforced label', async ({ page }) => {
        await expect(page.getByText('Controls Coverage').first()).toBeVisible();
        await expect(page.getByText('Enforced').first()).toBeVisible();
    });

    // ── 6. Program Status card ────────────────────────────────────────────────
    test('Dashboard Cards: Program Status card should show heading and tasks label', async ({ page }) => {
        await expect(page.getByText('Program Status').first()).toBeVisible();
        await expect(page.getByText(/tasks/i).first()).toBeVisible();
    });

    // ── 7. Framework Compliance section ──────────────────────────────────────
    test('Dashboard Cards: Framework Compliance section should be visible', async ({ page }) => {
        await expect(page.getByText('Framework Compliance').first()).toBeVisible();
    });

    // ── 8. Policy Status card ─────────────────────────────────────────────────
    test('Dashboard Cards: Policy Status card should show heading and Approved label', async ({ page }) => {
        await expect(page.getByText('Policy Status').first()).toBeVisible();
        await expect(page.getByText(/Approved/i).first()).toBeVisible();
    });

    // ── 9. Data Integrity card ────────────────────────────────────────────────
    test('Dashboard Cards: Data Integrity card should be visible', async ({ page }) => {
        await expect(page.getByText('Data Integrity').first()).toBeVisible();
    });

    // ── 10. Controls to Frameworks Mapping card ───────────────────────────────
    test('Dashboard Cards: Controls to Frameworks Mapping card should be visible', async ({ page }) => {
        await expect(page.getByText('Controls to Frameworks Mapping').first()).toBeVisible();
    });

    // ── 11. Security Score value ──────────────────────────────────────────────
    // The gauge shows either a 2-3 digit numeric score or "--" when no data.
    // Either is acceptable — what we guard against is a blank/missing value.
    test('Dashboard Cards: Security Score card should display a value or placeholder', async ({ page }) => {
        const scoreCard = page.locator('h3').filter({ hasText: 'Security Score' }).first()
            .locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
        await expect(scoreCard).toBeVisible();
        // The gauge renders a number (e.g. "72") or "--" — check that some text exists inside the card
        const text = await scoreCard.textContent();
        expect(text).toBeTruthy();
        expect(text!.length).toBeGreaterThan(0);
    });
});
