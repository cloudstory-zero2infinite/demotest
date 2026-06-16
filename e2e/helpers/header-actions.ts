import { expect, Page } from '@playwright/test';

export class HeaderActions {
    constructor(private page: Page) { }

    /** Open the user profile dropdown by clicking the avatar button. */
    async openProfileMenu() {
        // The avatar button is uniquely identified by overflow-hidden (it clips the photo/initials).
        // The AI Employee / Notifications / dark-mode buttons don't have this class.
        await this.page.locator('header button.overflow-hidden').click();
        await expect(this.page.locator('text=Sign Out').first()).toBeVisible({ timeout: 5000 });
    }

    /** Locator for the user avatar button. */
    avatarButton() {
        return this.page.locator('header button.overflow-hidden');
    }

    /** Close the profile dropdown by pressing Escape. */
    async closeProfileMenu() {
        await this.page.keyboard.press('Escape');
    }

    /**
     * The dark mode toggle is the only header button with no title and no disabled
     * attribute — it sits between the bell and the avatar.
     */
    darkModeToggle() {
        return this.page.locator('header button:not([title]):not([disabled])').first();
    }

    /** Return whether the body currently has the "dark" class. */
    async isDarkMode(): Promise<boolean> {
        return this.page.evaluate(() => document.body.classList.contains('dark'));
    }

    /** Click Feedback in the profile dropdown and wait for the modal. */
    async openFeedback() {
        await this.openProfileMenu();
        await this.page.getByRole('button', { name: 'Feedback' }).click();
        await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    }

    /** Click Set Password in the profile dropdown and wait for the modal. */
    async openSetPassword() {
        await this.openProfileMenu();
        await this.page.getByRole('button', { name: /Set Password|Change Password/i }).click();
        await expect(this.page.locator('input[placeholder="New password"]')).toBeVisible({ timeout: 5000 });
    }
}
