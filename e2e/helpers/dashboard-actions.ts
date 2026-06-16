import { expect, Page } from '@playwright/test';

export class DashboardActions {
    constructor(private page: Page) { }

    /** Navigate to the Dashboard tab and wait for cards to be ready. */
    async navigate() {
        // Wait for any full-screen auth/onboarding overlay (z-[100]) to clear before interacting.
        // This overlay can briefly appear while the app resolves onboarding status.
        const overlay = this.page.locator('div.fixed.inset-0').filter({ has: this.page.locator('h1:has-text("Welcome to Zero to Infinite")') });
        if (await overlay.isVisible({ timeout: 3000 }).catch(() => false)) {
            await overlay.waitFor({ state: 'hidden', timeout: 15000 });
        }

        await this.page.getByRole('button', { name: /Dashboard/i }).click();
        await expect(this.page.getByText('Loading Dashboard Data...')).not.toBeVisible({ timeout: 20000 });
        await expect(this.page.getByText('Security Score').first()).toBeVisible({ timeout: 15000 });
        await this.page.waitForLoadState('networkidle');
    }

    /**
     * Click the expand button (⤢) on the ChartCard whose title matches `heading`.
     * ChartCard renders `aria-label="Expand chart"` on the expand button.
     */
    async expandCard(heading: string) {
        // Locate the h3 with the heading, walk up to the card container, then click its expand button
        const h3 = this.page.locator('h3').filter({ hasText: heading }).first();
        const card = h3.locator('xpath=ancestor::div[contains(@class,"rounded-xl") or contains(@class,"rounded-lg")]').first();
        await card.locator('button[aria-label="Expand chart"]').click();
    }

    /** Close the ExpandableChartModal by clicking its "Close expanded view" button. */
    async closeExpandedModal() {
        await this.page.locator('button[aria-label="Close expanded view"]').click();
    }
}
