/**
 * Sidebar Navigation — E2E Test Suite
 *
 * Scenarios:
 *  1.  All items visible     — 7 nav labels are visible when sidebar is expanded
 *  2.  MENU collapse         — clicking MENU toggle hides nav labels (icons-only mode)
 *  3.  MENU expand           — clicking MENU toggle again restores nav labels
 *  4.  Active state          — clicking a nav item applies the blue active highlight
 *  5.  Navigate → Dashboard  — Dashboard nav item loads the Security Score card
 *  6.  Navigate → Organisation — Organisation nav item loads its sub-tab navigation
 *  7.  Navigate → Program    — Program nav item loads the Program Tracker heading
 *  8.  Navigate → Governance — Governance nav item loads the Assets sub-tab
 *  9.  Navigate → Compliance — Compliance nav item loads the Compliance Frameworks heading
 *  10. Navigate → Risk Mgmt  — Risk Management nav item loads the Risk Registry heading
 *  11. Navigate → Logs       — Activity Logs nav item loads the Activity Logs heading
 *  12. Collapse navigate     — nav items are still reachable when sidebar is collapsed
 *
 * Login strategy: ensureLoggedIn reuses saved storageState.
 * All navigation tests re-expand the sidebar in beforeEach so they are order-independent.
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { SidebarActions } from '../../helpers/sidebar-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'sidebar');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Sidebar Navigation', () => {
    test.describe.configure({ timeout: 60_000 });

    let sidebar: SidebarActions;

    test.beforeEach(async ({ page }) => {
        sidebar = new SidebarActions(page);
        await ensureLoggedIn(page);
        // Always start with the sidebar expanded so label-based locators work.
        await sidebar.ensureExpanded();
    });

    test.afterEach(async ({ page }, testInfo) => {
        await captureSnapshot(page, testInfo);
    });

    // ── 1. All 7 nav labels visible ───────────────────────────────────────────
    test('Sidebar: all 7 navigation items should be visible when expanded', async ({ page }) => {
        const labels = ['Dashboard', 'Organisation', 'Program', 'Governance', 'Compliance', 'Risk Management', 'Activity Logs'];
        for (const label of labels) {
            await expect(sidebar.navItem(label)).toBeVisible();
        }
    });

    // ── 2. MENU toggle collapses the sidebar ──────────────────────────────────
    test('Sidebar: MENU toggle should collapse the sidebar to icon-only mode', async ({ page }) => {
        // Verify expanded first
        expect(await sidebar.isExpanded()).toBe(true);
        // Verify a label is visible before collapsing
        await expect(page.locator('aside').getByText('Dashboard')).toBeVisible();

        await sidebar.toggle();

        expect(await sidebar.isExpanded()).toBe(false);
        // Labels should no longer be rendered (icons only)
        await expect(page.locator('aside').getByText('Dashboard')).not.toBeVisible();
        // The aside should now have the narrow w-16 class
        const cls = await sidebar.sidebar().getAttribute('class');
        expect(cls).toContain('w-16');

        // Restore state for other tests
        await sidebar.toggle();
    });

    // ── 3. MENU toggle re-expands the sidebar ─────────────────────────────────
    test('Sidebar: MENU toggle should expand the sidebar and restore labels', async ({ page }) => {
        // Collapse first
        await sidebar.toggle();
        expect(await sidebar.isExpanded()).toBe(false);

        // Expand
        await sidebar.toggle();
        expect(await sidebar.isExpanded()).toBe(true);

        // All labels should be back
        await expect(sidebar.navItem('Dashboard')).toBeVisible();
        await expect(sidebar.navItem('Activity Logs')).toBeVisible();
    });

    // ── 4. Active state highlight ─────────────────────────────────────────────
    test('Sidebar: clicking a nav item should apply the active (blue) highlight', async ({ page }) => {
        // Click Program first to change away from Dashboard
        await sidebar.clickNavItem('Program');
        await expect(page.getByText('Program Tracker').first()).toBeVisible({ timeout: 15000 });

        expect(await sidebar.isNavItemActive('Program')).toBe(true);
        expect(await sidebar.isNavItemActive('Dashboard')).toBe(false);

        // Navigate back to Dashboard — it should become active again
        await sidebar.clickNavItem('Dashboard');
        await expect(page.getByText('Security Score').first()).toBeVisible({ timeout: 15000 });

        expect(await sidebar.isNavItemActive('Dashboard')).toBe(true);
        expect(await sidebar.isNavItemActive('Program')).toBe(false);
    });

    // ── 5. Navigate → Dashboard ───────────────────────────────────────────────
    test('Sidebar: Dashboard nav item should load the Dashboard with Security Score card', async ({ page }) => {
        // Navigate away first, then come back
        await sidebar.clickNavItem('Program');
        await expect(page.getByText('Program Tracker').first()).toBeVisible({ timeout: 15000 });

        await sidebar.clickNavItem('Dashboard');
        await expect(page.getByText('Security Score').first()).toBeVisible({ timeout: 20000 });
        // Dashboard should not be in loading state
        await expect(page.getByText('Loading Dashboard Data...')).not.toBeVisible();
    });

    // ── 6. Navigate → Organisation ────────────────────────────────────────────
    test('Sidebar: Organisation nav item should load the Organisation section', async ({ page }) => {
        await sidebar.clickNavItem('Organisation');

        // Organisation tab renders a set of sub-tabs; at least one must be present.
        // "View Organisation" and "Manage Member" are always visible in the sub-tab bar.
        await expect(
            page.getByRole('button', { name: /View Organisation|Manage Member|Settings|Templates/i }).first()
        ).toBeVisible({ timeout: 15000 });
    });

    // ── 7. Navigate → Program ─────────────────────────────────────────────────
    test('Sidebar: Program nav item should load the Program Tracker', async ({ page }) => {
        await sidebar.clickNavItem('Program', 'Program Tracker');
    });

    // ── 8. Navigate → Governance ──────────────────────────────────────────────
    test('Sidebar: Governance nav item should load the Governance section (Assets default)', async ({ page }) => {
        await sidebar.clickNavItem('Governance');

        // Governance defaults to the Assets sub-tab; its sub-tab bar is the
        // most reliable marker since data may be empty.
        await expect(
            page.getByRole('button', { name: /^Assets$/i }).first()
        ).toBeVisible({ timeout: 15000 });
    });

    // ── 9. Navigate → Compliance ──────────────────────────────────────────────
    test('Sidebar: Compliance nav item should load the Compliance Frameworks page', async ({ page }) => {
        await sidebar.clickNavItem('Compliance', 'Compliance Frameworks');
    });

    // ── 10. Navigate → Risk Management ───────────────────────────────────────
    test('Sidebar: Risk Management nav item should load the Risk Registry', async ({ page }) => {
        await sidebar.clickNavItem('Risk Management', 'Risk Registry');
    });

    // ── 11. Navigate → Activity Logs ─────────────────────────────────────────
    test('Sidebar: Activity Logs nav item should load the Application Activity Logs page', async ({ page }) => {
        await sidebar.clickNavItem('Activity Logs', 'Application Activity Logs');
    });

    // ── 12. Navigation works in collapsed mode ────────────────────────────────
    test('Sidebar: nav items should still navigate correctly when sidebar is collapsed', async ({ page }) => {
        // Collapse the sidebar
        await sidebar.toggle();
        expect(await sidebar.isExpanded()).toBe(false);

        // Nav buttons are still in the DOM, just without visible labels.
        // Their `title` attributes allow Playwright to find them.
        // We use the underlying button locator (icons are still present).
        const programBtn = page.locator('aside nav button[title="Program"]');
        await expect(programBtn).toBeVisible({ timeout: 5000 });
        await programBtn.click();

        await expect(page.getByText('Program Tracker').first()).toBeVisible({ timeout: 15000 });

        // Restore sidebar
        await sidebar.toggle();
    });
});
