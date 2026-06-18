import { expect, Page } from '@playwright/test';

export class PolicyActions {
    constructor(private page: Page) { }

    private searchInput() {
        return this.page.getByPlaceholder('Search policies...').first();
    }

    /** Navigate to Governance → Policy tab */
    async navigate() {
        await this.page.getByRole('button', { name: /Governance/i }).click();
        await this.page.getByRole('button', { name: 'Policy', exact: true }).click();
        await expect(this.searchInput()).toBeVisible({ timeout: 15000 });
        await this.page.waitForLoadState('networkidle');
    }

    /**
     * Create a new draft policy.
     * Returns the policy name so tests can reference it.
     */
    async create(title: string): Promise<string> {
        // Click the + (Add Policy) button in the toolbar
        await this.page.locator('button[title="Add Policy"]').first().click();

        // EditorModal opens with heading "New Policy"
        const editorHeading = this.page.locator('h2').filter({ hasText: 'New Policy' }).first();
        await expect(editorHeading).toBeVisible({ timeout: 10000 });

        // Fill markdown content
        const markdownArea = this.page.locator('textarea').first();
        await expect(markdownArea).toBeVisible({ timeout: 5000 });
        await markdownArea.fill(`# ${title}\n\nE2E test policy created at ${new Date().toISOString()}.`);

        // Save — waits for POST /api/policies
        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/policies') && res.request().method() === 'POST',
                { timeout: 45000 }
            ),
            this.page.getByRole('button', { name: /^Save$/i }).first().click(),
        ]);

        expect(response.status()).toBeLessThan(300);

        // Modal closes
        await expect(editorHeading).not.toBeVisible({ timeout: 10000 });

        // Verify card appears by filtering results (avoids waiting on slow list refresh / other matching text)
        const search = this.searchInput();
        await search.fill(title);
        const card = this.page.getByText(title, { exact: true }).first();
        await expect(card).toBeVisible({ timeout: 15000 });
        await search.clear();
        return title;
    }

    /**
     * Update a policy by clicking its card → View modal → Edit button → save.
     */
    async update(title: string, newTitle: string): Promise<void> {
        // Filter to the policy card, then click it
        const search = this.searchInput();
        await search.fill(title);
        const card = this.page.getByText(title, { exact: true }).first();
        await expect(card).toBeVisible({ timeout: 10000 });
        await card.click();

        // ViewModal opens — click Edit button in header
        const viewModal = this.page.locator('h2').filter({ hasText: title }).first();
        await expect(viewModal).toBeVisible({ timeout: 10000 });
        await this.page.locator('button[title="Edit"]').first().click();

        // EditorModal opens with heading "Edit Policy"
        const editorHeading = this.page.locator('h2').filter({ hasText: 'Edit Policy' }).first();
        await expect(editorHeading).toBeVisible({ timeout: 10000 });

        const markdownArea = this.page.locator('textarea').first();
        await expect(markdownArea).toBeVisible({ timeout: 5000 });
        await markdownArea.fill(`# ${newTitle}\n\nUpdated by E2E at ${new Date().toISOString()}.`);

        // Click Save and wait for the editor to close.
        // Waiting for API responses is brittle here because the UI may debounce/update asynchronously.
        await this.page.getByRole('button', { name: /^Save$/i }).first().click();
        await expect(editorHeading).not.toBeVisible({ timeout: 10000 });

        // Confirm updated title appears via search
        await search.fill(newTitle);
        await expect(this.page.getByText(newTitle, { exact: true }).first()).toBeVisible({ timeout: 15000 });
        await search.clear();
    }

    /**
     * Delete a policy by clicking its card → View modal → Delete button.
     * The delete uses a browser confirm() dialog.
     */
    async delete(title: string): Promise<void> {
        // Filter to the policy card, then click it
        const search = this.searchInput();
        await search.fill(title);
        const card = this.page.getByText(title, { exact: true }).first();
        await expect(card).toBeVisible({ timeout: 10000 });
        await card.click();

        const viewModalHeading = this.page.locator('h2').filter({ hasText: title }).first();
        await expect(viewModalHeading).toBeVisible({ timeout: 10000 });

        // ViewModal opens — accept the browser confirm() dialog before clicking Delete
        this.page.once('dialog', dialog => dialog.accept());

        // Click Delete in the ViewModal header
        await this.page.locator('button[title="Delete"]').first().click();

        // Wait for DELETE API call
        await this.page.waitForResponse(
            res => res.url().includes('/api/policies') && res.request().method() === 'DELETE',
            { timeout: 45000 }
        );

        // Modal should close (or at least the title heading should disappear)
        await expect(viewModalHeading).not.toBeVisible({ timeout: 10000 });

        // Filter list and assert empty state, which avoids matching stale modal text/toasts.
        await expect(search).toBeVisible({ timeout: 10000 });
        await search.fill(title);
        await this.page.waitForTimeout(250);

        const emptyState = this.page.getByText(`No policies matching "${title}"`).first();
        await expect(emptyState).toBeVisible({ timeout: 10000 });

        await search.clear();
    }
}
