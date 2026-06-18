import { expect, Page } from '@playwright/test';

export class RiskActions {
    constructor(private page: Page) { }

    /** Navigate to Risk Management tab */
    async navigate() {
        await this.page.getByRole('button', { name: /Risk Management/i }).click();
        await expect(this.page.getByText('Risk Registry')).toBeVisible({ timeout: 15000 });
        await this.page.waitForLoadState('networkidle');
    }

    /** Open the Add Risk modal */
    async openAddModal() {
        // Use evaluate() to click the visible button — multiple hidden tabs may share text "Add Risk"
        const clicked = await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b => {
                const rect = b.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && b.textContent?.trim().includes('Add Risk');
            });
            if (btn) { (btn as HTMLButtonElement).click(); return true; }
            return false;
        });
        if (!clicked) throw new Error('Add Risk button not found/visible');
        await expect(this.page.locator('text=Add Risk').last()).toBeVisible({ timeout: 10000 });
    }

    /**
     * Create a manual risk entry.
     * Returns the name used.
     */
    async create(name: string, opts: { grouping?: string; inherentLevel?: string; residualLevel?: string } = {}): Promise<string> {
        await this.openAddModal();

        const modal = this.page.locator('.fixed.inset-0').last();
        await expect(modal).toBeVisible({ timeout: 10000 });

        // Risk name
        await modal.locator('input[placeholder*="Unencrypted"]').fill(name);

        if (opts.grouping) {
            await modal.locator('input[placeholder*="Data Security"]').fill(opts.grouping);
        }
        if (opts.inherentLevel) {
            await modal.locator('select').nth(0).selectOption(opts.inherentLevel);
        }
        if (opts.residualLevel) {
            await modal.locator('select').nth(1).selectOption(opts.residualLevel);
        }

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/risk') && res.request().method() === 'POST',
                { timeout: 45000 }
            ),
            modal.locator('button').filter({ hasText: /Add risk/i }).click(),
        ]);

        expect(response.status()).toBeLessThan(300);
        await expect(modal).not.toBeVisible({ timeout: 10000 });

        // Verify row appears
        await expect(this.page.locator('td').filter({ hasText: name }).first()).toBeVisible({ timeout: 10000 });
        return name;
    }

    /**
     * Edit a manual risk's name.
     */
    async update(currentName: string, newName: string): Promise<void> {
        const row = this.page.locator('tr').filter({ hasText: currentName }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.locator('button[title="Edit"]').click();

        const modal = this.page.locator('.fixed.inset-0').last();
        await expect(modal).toBeVisible({ timeout: 10000 });

        const nameInput = modal.locator('input[placeholder*="Unencrypted"]');
        await nameInput.fill(newName);

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/risk') && (res.request().method() === 'PUT' || res.request().method() === 'PATCH'),
                { timeout: 45000 }
            ),
            modal.locator('button').filter({ hasText: /Save changes/i }).click(),
        ]);

        expect(response.status()).toBeLessThan(300);
        await expect(modal).not.toBeVisible({ timeout: 10000 });
    }

    /**
     * Delete a manual risk via the Delete button + browser confirm dialog.
     */
    async delete(name: string): Promise<void> {
        const row = this.page.locator('tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });

        // The delete uses window.confirm — accept it
        this.page.once('dialog', dialog => dialog.accept());

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/risk') && res.request().method() === 'DELETE',
                { timeout: 45000 }
            ),
            row.locator('button[title="Delete"]').click(),
        ]);

        expect([200, 204]).toContain(response.status());
        await expect(this.page.locator('tr').filter({ hasText: name })).toHaveCount(0, { timeout: 10000 });
    }
}
