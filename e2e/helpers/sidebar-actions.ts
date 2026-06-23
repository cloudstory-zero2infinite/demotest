import { expect, Page } from '@playwright/test';

export class SidebarActions {
    constructor(private page: Page) { }

    /** The <aside> element that is the sidebar container. */
    sidebar() {
        return this.page.locator('aside').first();
    }

    /** The MENU collapse/expand toggle button inside the sidebar. */
    menuToggle() {
        return this.page.locator('aside button[title="Collapse sidebar"], aside button[title="Expand sidebar"]').first();
    }

    /** Whether the sidebar is currently in the expanded (wide) state. */
    async isExpanded(): Promise<boolean> {
        const cls = await this.sidebar().getAttribute('class');
        return (cls ?? '').includes('w-56');
    }

    /** Click the MENU toggle and wait for the animation to settle. */
    async toggle() {
        await this.menuToggle().click();
        await this.page.waitForTimeout(300); // transition-all duration-200
    }

    /** Ensure the sidebar is in the expanded state; toggle once if not. */
    async ensureExpanded() {
        if (!(await this.isExpanded())) {
            await this.toggle();
        }
    }

    /** Get the nav button for the given label (e.g. "Dashboard"). */
    navItem(label: string) {
        return this.page.locator('aside nav button').filter({ hasText: label }).first();
    }

    /**
     * Click a nav item and wait for the content area to reflect the navigation.
     * Pass `waitForText` to assert that a specific heading becomes visible.
     */
    async clickNavItem(label: string, waitForText?: string) {
        await this.navItem(label).click();
        if (waitForText) {
            await expect(this.page.getByText(waitForText).first()).toBeVisible({ timeout: 45000 });
        }
    }

    /** Return true if the nav item for `label` carries the active (blue) CSS classes. */
    async isNavItemActive(label: string): Promise<boolean> {
        const cls = await this.navItem(label).getAttribute('class');
        return (cls ?? '').includes('text-blue-600') || (cls ?? '').includes('text-blue-400');
    }
}
