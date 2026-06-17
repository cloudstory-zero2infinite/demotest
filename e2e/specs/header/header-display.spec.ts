/**
 * Global Header — Display & Navigation Suite
 *
 * All tests are read-only or toggling (no data mutations, no sign-out).
 * Verifies branding, theme switching, avatar, profile dropdown content,
 * and the notification bell.
 *
 *  1. App title         — "Zero to Infinite" heading is visible
 *  2. Subtitle          — "UNIFIED CYBER PLATFORM" tagline is visible
 *  3. Dark/Light toggle — switches body class and reverts correctly
 *  4. User avatar       — initials/photo button visible in header
 *  5. Profile dropdown  — clicking avatar shows user email in dropdown
 *  6. Dropdown items    — Feedback, Help & Support, Set Password, Sign Out, Delete present
 *  7. Notification bell — bell button with title="Notifications" is visible
 *  8. Dark mode persist — toggling dark mode and navigating to Program keeps class
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { HeaderActions } from '../../helpers/header-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'header-display');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Global Header / Display', () => {
    test.describe.configure({ timeout: 60_000 });

    let header: HeaderActions;

    test.beforeEach(async ({ page }) => {
        header = new HeaderActions(page);
        await ensureLoggedIn(page);
    });

    test.afterEach(async ({ page }, testInfo) => {
        await captureSnapshot(page, testInfo);
    });

    // ── 1. App title ──────────────────────────────────────────────────────────
    test('Header Display: should show the app title "Zero to Infinite"', async ({ page }) => {
        await expect(page.locator('header h1').filter({ hasText: 'Zero to Infinite' })).toBeVisible();
    });

    // ── 2. Subtitle ───────────────────────────────────────────────────────────
    test('Header Display: should show the "UNIFIED CYBER PLATFORM" subtitle', async ({ page }) => {
        await expect(page.locator('header').getByText('UNIFIED CYBER PLATFORM')).toBeVisible();
    });

    // ── 3. Dark / Light mode toggle ───────────────────────────────────────────
    test('Header Display: dark/light mode toggle should flip body theme class', async ({ page }) => {
        const toggle = header.darkModeToggle();
        await expect(toggle).toBeVisible();

        const wasDark = await header.isDarkMode();

        await toggle.click();
        expect(await header.isDarkMode()).toBe(!wasDark);

        await toggle.click();
        expect(await header.isDarkMode()).toBe(wasDark);
    });

    // ── 4. User avatar ────────────────────────────────────────────────────────
    test('Header Display: user initials avatar should be visible in the header', async ({ page }) => {
        const avatar = header.avatarButton();
        await expect(avatar).toBeVisible();
        const hasContent = await avatar.locator('img, span').count();
        expect(hasContent).toBeGreaterThan(0);
    });

    // ── 5. Profile dropdown email ─────────────────────────────────────────────
    test('Header Display: clicking avatar should open dropdown with user email', async ({ page }) => {
        await header.openProfileMenu();

        const dropdown = page.locator('header .absolute.right-0').filter({ hasText: 'Sign Out' }).first();
        await expect(dropdown).toBeVisible();

        const emailEl = dropdown.locator('p.text-xs.text-gray-500, p.text-xs.text-gray-400').first();
        await expect(emailEl).toBeVisible();
        const emailText = await emailEl.textContent();
        expect(emailText).toMatch(/@/);

        await header.closeProfileMenu();
    });

    // ── 6. Dropdown menu items ────────────────────────────────────────────────
    test('Header Display: profile dropdown should contain all expected menu items', async ({ page }) => {
        await header.openProfileMenu();

        const dropdown = page.locator('header .absolute.right-0').filter({ hasText: 'Sign Out' }).first();
        await expect(dropdown.getByRole('button', { name: 'Feedback' })).toBeVisible();
        await expect(dropdown.getByRole('button', { name: 'Help & Support' })).toBeVisible();
        await expect(dropdown.getByRole('button', { name: /Set Password|Change Password/i })).toBeVisible();
        await expect(dropdown.getByRole('button', { name: 'Sign Out' })).toBeVisible();
        await expect(dropdown.getByRole('button', { name: 'Delete My Account' })).toBeVisible();

        await header.closeProfileMenu();
    });

    // ── 7. Notification bell ──────────────────────────────────────────────────
    // The header renders a bell button (title="Notifications") for the notification centre.
    test('Header Display: notification bell button should be visible in the header', async ({ page }) => {
        const bell = page.locator('header button[title="Notifications"]').first();
        await expect(bell).toBeVisible({ timeout: 5000 });
    });

    // ── 8. Dark mode persists across tab navigation ───────────────────────────
    // Enabling dark mode and then navigating to the Program tab should keep the
    // body.dark class — the theme must survive React re-renders triggered by tab switches.
    test('Header Display: dark mode body class should persist after navigating to Program tab', async ({ page }) => {
        const toggle = header.darkModeToggle();
        const wasDark = await header.isDarkMode();

        // Switch to dark if not already
        if (!wasDark) {
            await toggle.click();
            expect(await header.isDarkMode()).toBe(true);
        }

        // Navigate to Program tab
        await page.getByRole('button', { name: /Program/i }).click();
        await expect(page.getByText('Program Tracker').first()).toBeVisible({ timeout: 15000 });

        // Dark class must still be set
        expect(await header.isDarkMode()).toBe(true);

        // Restore original theme
        if (!wasDark) {
            await toggle.click();
            expect(await header.isDarkMode()).toBe(false);
        }
    });
});
