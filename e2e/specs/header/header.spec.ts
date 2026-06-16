/**
 * Global Header — E2E Test Suite
 *
 * Scenarios:
 *  1.  Title           — "Zero to Infinite" heading is visible
 *  2.  Subtitle        — "UNIFIED CYBER PLATFORM" tagline is visible
 *  3.  Dark/Light mode — toggle switches the body theme class and reverts
 *  4.  User initials   — avatar button with initials is visible in the header
 *  5.  Profile dropdown — clicking avatar shows email, menu items
 *  6.  Dropdown items  — Feedback, Set Password, Sign Out, Delete My Account present
 *  7.  Feedback modal  — clicking Feedback opens the rating dialog
 *  8.  Feedback submit — filling stars + comment and submitting works
 *  9.  Set Password    — clicking Set Password opens the password dialog
 *  10. Set Password    — dialog has required fields; Cancel closes without changes
 *  11. Delete account  — "Delete My Account" button is visible (not pressed)
 *  12. Sign Out        — clicking Sign Out logs the user out (runs last)
 *
 * Login strategy: ensureLoggedIn reuses saved storageState.
 * Sign Out test is placed last — it intentionally ends the session.
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { HeaderActions } from '../../helpers/header-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'header');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Global Header', () => {
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
    test('Header: should display the app title "Zero to Infinite"', async ({ page }) => {
        await expect(page.locator('header h1').filter({ hasText: 'Zero to Infinite' })).toBeVisible();
    });

    // ── 2. Subtitle ───────────────────────────────────────────────────────────
    test('Header: should display the "UNIFIED CYBER PLATFORM" subtitle', async ({ page }) => {
        await expect(page.locator('header').getByText('UNIFIED CYBER PLATFORM')).toBeVisible();
    });

    // ── 3. Dark / Light mode toggle ───────────────────────────────────────────
    test('Header: dark/light mode toggle should switch body theme class', async ({ page }) => {
        const toggle = header.darkModeToggle();
        await expect(toggle).toBeVisible();

        const wasDark = await header.isDarkMode();

        // Toggle → verify class flipped
        await toggle.click();
        const nowDark = await header.isDarkMode();
        expect(nowDark).toBe(!wasDark);

        // Toggle back → verify restored
        await toggle.click();
        const restoredDark = await header.isDarkMode();
        expect(restoredDark).toBe(wasDark);
    });

    // ── 4. User initials / avatar ─────────────────────────────────────────────
    test('Header: user initials avatar should be visible in the header', async ({ page }) => {
        const avatar = header.avatarButton();
        await expect(avatar).toBeVisible();
        // Should contain either a photo img or the initials span
        const hasContent = await avatar.locator('img, span').count();
        expect(hasContent).toBeGreaterThan(0);
    });

    // ── 5. Profile dropdown — email visible ───────────────────────────────────
    test('Header: clicking avatar should open profile dropdown with user email', async ({ page }) => {
        await header.openProfileMenu();

        const dropdown = page.locator('header .absolute.right-0').filter({ hasText: 'Sign Out' }).first();
        await expect(dropdown).toBeVisible();

        // Email is shown in the dropdown header
        const emailEl = dropdown.locator('p.text-xs.text-gray-500, p.text-xs.text-gray-400').first();
        await expect(emailEl).toBeVisible();
        const emailText = await emailEl.textContent();
        expect(emailText).toMatch(/@/);

        await header.closeProfileMenu();
    });

    // ── 6. Dropdown items present ─────────────────────────────────────────────
    test('Header: profile dropdown should contain all expected menu items', async ({ page }) => {
        await header.openProfileMenu();

        const dropdown = page.locator('header .absolute.right-0').filter({ hasText: 'Sign Out' }).first();

        await expect(dropdown.getByRole('button', { name: 'Feedback' })).toBeVisible();
        await expect(dropdown.getByRole('button', { name: 'Help & Support' })).toBeVisible();
        await expect(dropdown.getByRole('button', { name: /Set Password|Change Password/i })).toBeVisible();
        await expect(dropdown.getByRole('button', { name: 'Sign Out' })).toBeVisible();
        await expect(dropdown.getByRole('button', { name: 'Delete My Account' })).toBeVisible();

        await header.closeProfileMenu();
    });

    // ── 7. Feedback modal opens ───────────────────────────────────────────────
    test('Header: clicking Feedback should open the feedback dialog', async ({ page }) => {
        await header.openFeedback();

        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('How would you rate us?')).toBeVisible();
        await expect(dialog.getByText('Pick a rate *')).toBeVisible();
        // 5 star buttons (inside the star rating row, not the close button)
        const starRow = dialog.locator('div').filter({ has: page.locator('button svg') }).filter({ hasNot: page.locator('h2') }).first();
        const stars = starRow.locator('button');
        await expect(stars).toHaveCount(5);
        // Feedback textarea
        await expect(dialog.getByPlaceholder('Share your thoughts, suggestions, or issues...')).toBeVisible();
        // Action buttons
        await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Submit' })).toBeVisible();

        // Close via Cancel
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
    });

    // ── 8. Feedback submit ────────────────────────────────────────────────────
    test('Header: should be able to submit feedback with a rating and comment', async ({ page }) => {
        test.setTimeout(30_000);
        await header.openFeedback();

        const dialog = page.getByRole('dialog');

        // Click the 4th star
        const stars = dialog.locator('button').filter({ has: page.locator('svg') });
        await stars.nth(3).click();

        // Fill comment
        await dialog.getByPlaceholder('Share your thoughts, suggestions, or issues...').fill('E2E automated test feedback — please ignore.');

        // Submit
        await dialog.getByRole('button', { name: 'Submit' }).click();

        // Modal should close after successful submission (or show success state)
        await expect(dialog).not.toBeVisible({ timeout: 15000 });
    });

    // ── 9. Set Password dialog opens ──────────────────────────────────────────
    test('Header: clicking Set Password should open the password dialog', async ({ page }) => {
        await header.openSetPassword();

        // Dialog is identified by the password inputs
        await expect(page.locator('input[placeholder="New password"]')).toBeVisible();
        await expect(page.locator('input[placeholder="Confirm new password"]')).toBeVisible();

        // Heading
        await expect(page.getByText(/Set Password|Change Password/i).first()).toBeVisible();

        // Action buttons
        await expect(page.getByRole('button', { name: 'Cancel' }).last()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Update Password' })).toBeVisible();
    });

    // ── 10. Set Password — Cancel closes without changes ──────────────────────
    test('Header: Set Password dialog Cancel should close without modifying password', async ({ page }) => {
        await header.openSetPassword();

        // Verify inputs are empty (not pre-filled)
        const newPwdInput = page.locator('input[placeholder="New password"]');
        await expect(newPwdInput).toHaveValue('');

        // Cancel
        await page.getByRole('button', { name: 'Cancel' }).last().click();

        // Dialog should close
        await expect(newPwdInput).not.toBeVisible({ timeout: 5000 });
    });

    // ── 11. Delete My Account — visible but not pressed ───────────────────────
    test('Header: Delete My Account button should be visible in the dropdown', async ({ page }) => {
        await header.openProfileMenu();

        const deleteBtn = page.getByRole('button', { name: 'Delete My Account' });
        await expect(deleteBtn).toBeVisible();

        // Verify it's styled in red (danger action)
        const cls = await deleteBtn.getAttribute('class');
        expect(cls).toMatch(/red/);

        // Do NOT click it — just close the menu
        await header.closeProfileMenu();
    });

    // ── 12. Sign Out — runs last, ends the session ────────────────────────────
    test('Header: Sign Out should log the user out and show the login screen', async ({ page }) => {
        test.setTimeout(30_000);

        await header.openProfileMenu();
        await page.getByRole('button', { name: 'Sign Out' }).click();

        // After sign-out the app should redirect to the auth/login screen
        await expect(
            page.getByRole('button', { name: /Login with Email|Sign in|Sign In|Login with Google/i }).first()
        ).toBeVisible({ timeout: 20000 });
    });
});
