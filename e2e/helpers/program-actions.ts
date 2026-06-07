import { expect, Page } from '@playwright/test';

export class ProgramActions {
    constructor(private page: Page) { }

    private filterInput() {
        return this.page.getByPlaceholder('Filter tasks...').first();
    }

    /** Navigate to Program tab */
    async navigate() {
        await this.page.getByRole('button', { name: /^Program$/i }).click();
        await expect(this.page.getByPlaceholder('Filter tasks...').first()).toBeVisible({ timeout: 15000 });
        await this.page.waitForLoadState('networkidle');
    }

    /**
     * Create a new task.
     * Returns the task name used (caller can pass an explicit name).
     */
    async create(name: string, opts: { description?: string; dueDate?: string } = {}): Promise<string> {
        const addBtn = this.page.locator('button[title="Add Task"]').first();
        await expect(addBtn).toBeVisible({ timeout: 10000 });
        await addBtn.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.getByText('Add New Task')).toBeVisible();

        await dialog.locator('input[name="program_name"]').first().fill(name);

        if (opts.description) {
            await dialog.locator('textarea[name="description"]').first().fill(opts.description);
        }
        if (opts.dueDate) {
            await dialog.locator('input[name="due_date"]').first().fill(opts.dueDate);
        }

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/program') && res.request().method() === 'POST',
                { timeout: 20000 }
            ),
            dialog.locator('button[type="submit"]').filter({ hasText: /^Save$/ }).first().click(),
        ]);

        expect(response.status()).toBeLessThan(300);
        await expect(dialog).not.toBeVisible({ timeout: 10000 });

        // Verify row appears via filter
        await this.filterInput().fill(name);
        const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await this.filterInput().clear();

        return name;
    }

    /**
     * Open view modal for a task, then switch to edit mode and update name.
     */
    async update(currentName: string, newName: string): Promise<void> {
        await this.filterInput().fill(currentName);
        const row = this.page.locator('tbody tr').filter({ hasText: currentName }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        // Click the edit pencil in the modal header
        await dialog.locator('button[title="Edit"]').first().click();

        const nameInput = dialog.locator('input[name="program_name"]').first();
        await expect(nameInput).toBeVisible({ timeout: 5000 });
        await nameInput.fill(newName);

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/program') &&
                    (res.request().method() === 'PUT' || res.request().method() === 'PATCH'),
                { timeout: 20000 }
            ),
            dialog.locator('button[type="submit"]').filter({ hasText: /^Save$/ }).first().click(),
        ]);

        expect(response.status()).toBeLessThan(300);
        await expect(dialog).not.toBeVisible({ timeout: 10000 });
        await this.filterInput().clear();
    }

    /**
     * Delete a task via View → Delete icon → Confirm Deletion modal.
     */
    async delete(name: string): Promise<void> {
        await this.filterInput().fill(name);
        const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await dialog.locator('button[title="Delete"]').first().click();

        // DeleteConfirmationModal
        const confirmDialog = this.page.locator('[role="dialog"]').first();
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });

        const deleteBtn = confirmDialog.locator('button.bg-red-600').filter({ hasText: /^Delete$/ }).first();
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/program') && res.request().method() === 'DELETE',
                { timeout: 20000 }
            ),
            deleteBtn.click(),
        ]);

        expect([200, 204]).toContain(response.status());
        await this.filterInput().clear();
    }

    /**
     * Open the view modal for a task and return the dialog locator.
     */
    async openView(name: string) {
        await this.filterInput().fill(name);
        const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();
        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        return dialog;
    }
}
