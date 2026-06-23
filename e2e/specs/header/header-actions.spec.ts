/**
 * Global Header — Actions Suite
 *
 * Covers all interactive actions reachable from the header: feedback, password
 * management, account deletion confirmation, and sign-out.
 * Sign Out (test 8) is placed LAST — it intentionally ends the session.
 *
 *  1. Feedback modal    — clicking Feedback opens rating dialog with all elements
 *  2. Feedback submit   — filling stars + comment and submitting works
 *  3. Feedback cancel   — Cancel dismisses dialog without sending a network request
 *  4. Set Password      — clicking Set Password opens the password dialog
 *  5. Set Password cancel — Cancel closes without changing anything
 *  6. Set Password mismatch — mismatched passwords shows a validation error message
 *  7. Delete account    — button visible in dropdown (not clicked)
 *  8. Sign Out          — logs out and shows login screen (runs last)
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { HeaderActions } from '../../helpers/header-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'header-actions');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Global Header / Actions', () => {
    test.describe.configure({ timeout: 60_000 });

    let header: HeaderActions;

    test.beforeEach(async ({ page }) => {
        header = new HeaderActions(page);
        await ensureLoggedIn(page);
    });

    test.afterEach(async ({ page }, testInfo) => {
        await captureSnapshot(page, testInfo);
    });

    // ── 1. Feedback modal opens ───────────────────────────────────────────────
    test('Header Actions: clicking Feedback should open the feedback dialog', async ({ page }) => {
        await header.openFeedback();

        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('How would you rate us?')).toBeVisible();
        await expect(dialog.getByText('Pick a rate *')).toBeVisible();
        const starRow = dialog.locator('div').filter({ has: page.locator('button svg') }).filter({ hasNot: page.locator('h2') }).first();
        const stars = starRow.locator('button');
        await expect(stars).toHaveCount(5);
        await expect(dialog.getByPlaceholder('Share your thoughts, suggestions, or issues...')).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Submit' })).toBeVisible();

        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
    });

    // ── 2. Feedback submit ────────────────────────────────────────────────────
    test('Header Actions: should submit feedback with a rating and comment', async ({ page }) => {
        test.setTimeout(30_000);
        await header.openFeedback();

        const dialog = page.getByRole('dialog');
        const stars = dialog.locator('button').filter({ has: page.locator('svg') });
        await stars.nth(3).click();
        await dialog.getByPlaceholder('Share your thoughts, suggestions, or issues...').fill('E2E automated test feedback — please ignore.');
        await dialog.getByRole('button', { name: 'Submit' }).click();
        await expect(dialog).not.toBeVisible({ timeout: 15000 });
    });

    // ── 3. Feedback cancel — no submission ────────────────────────────────────
    // Typing text in the comment box and clicking Cancel should close the dialog
    // without making a POST /api/feedback call.
    test('Header Actions: Feedback Cancel should close dialog without submitting', async ({ page }) => {
        await header.openFeedback();

        const dialog = page.getByRole('dialog');
        await dialog.getByPlaceholder('Share your thoughts, suggestions, or issues...').fill('Should not be submitted');

        // Track whether a feedback API call is made after Cancel
        let feedbackCalled = false;
        page.on('request', req => {
            if (req.url().includes('/api/feedback') && req.method() === 'POST') {
                feedbackCalled = true;
            }
        });

        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });

        // Brief wait to catch any delayed POST
        await page.waitForTimeout(500);
        expect(feedbackCalled).toBe(false);
    });

    // ── 4. Set Password dialog opens ──────────────────────────────────────────
    test('Header Actions: clicking Set Password should open the password dialog', async ({ page }) => {
        await header.openSetPassword();

        await expect(page.locator('input[placeholder="New password"]')).toBeVisible();
        await expect(page.locator('input[placeholder="Confirm new password"]')).toBeVisible();
        await expect(page.getByText(/Set Password|Change Password/i).first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Cancel' }).last()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Update Password' })).toBeVisible();
    });

    // ── 5. Set Password cancel ────────────────────────────────────────────────
    test('Header Actions: Set Password Cancel should close without modifying password', async ({ page }) => {
        await header.openSetPassword();

        const newPwdInput = page.locator('input[placeholder="New password"]');
        await expect(newPwdInput).toHaveValue('');

        await page.getByRole('button', { name: 'Cancel' }).last().click();
        await expect(newPwdInput).not.toBeVisible({ timeout: 5000 });
    });

    // ── 6. Set Password mismatch validation ───────────────────────────────────
    // Submitting two different passwords should show a client-side error without
    // calling the Supabase API — the password must NOT actually change.
    test('Header Actions: mismatched passwords should show a validation error', async ({ page }) => {
        await header.openSetPassword();

        await page.locator('input[placeholder="New password"]').fill('SecurePass123!');
        await page.locator('input[placeholder="Confirm new password"]').fill('DifferentPass456!');
        await page.getByRole('button', { name: 'Update Password' }).click();

        // Error text indicating mismatch should appear somewhere in the form area
        const errorText = page.getByText(/do not match|passwords.*match|match.*password/i).first();
        await expect(errorText).toBeVisible({ timeout: 5000 });

        // Dialog should still be open (not submitted successfully)
        await expect(page.locator('input[placeholder="New password"]')).toBeVisible();

        // Clean up — close without changing password
        await page.getByRole('button', { name: 'Cancel' }).last().click();
    });

    // ── 7. Delete My Account — visible but not pressed ────────────────────────
    test('Header Actions: Delete My Account button should be visible and styled red', async ({ page }) => {
        await header.openProfileMenu();

        const deleteBtn = page.getByRole('button', { name: 'Delete My Account' });
        await expect(deleteBtn).toBeVisible();
        const cls = await deleteBtn.getAttribute('class');
        expect(cls).toMatch(/red/);

        await header.closeProfileMenu();
    });

    // ── 8. Sign Out — runs last, ends the session ─────────────────────────────
    test('Header Actions: Sign Out should log the user out and show the login screen', async ({ page }) => {
        test.setTimeout(30_000);

        await header.openProfileMenu();
        await page.getByRole('button', { name: 'Sign Out' }).click();

        await expect(
            page.getByRole('button', { name: /Login with Email|Sign in|Sign In|Login with Google/i }).first()
        ).toBeVisible({ timeout: 45000 });
    });
});
