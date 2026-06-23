import { expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * CapabilityRegisterActions — helper for Governance → Capability Register E2E tests.
 *
 * API endpoints used:
 *   POST   /api/capabilities           (add)
 *   GET    /api/capabilities           (list)
 *   PUT    /api/capabilities/:id       (edit)
 *   DELETE /api/capabilities/:id       (single delete)
 *   DELETE /api/capabilities/bulk      (bulk delete)
 *   POST   /api/capabilities/bulk      (bulk create)
 *   GET    /api/custom-fields/capabilities
 *   POST   /api/custom-fields/capabilities
 *   DELETE /api/custom-fields/capabilities/:id
 *   POST   /api/contacts              (create org contact for capability owner)
 */
export class CapabilityRegisterActions {
    constructor(private page: Page) {}

    filterInput() {
        return this.page.getByPlaceholder('Filter capabilities...').first();
    }

    // ── Navigation ─────────────────────────────────────────────────────────────

    async navigate(): Promise<void> {
        await this.page.getByRole('button', { name: /Governance/i }).click();
        await this.page.getByRole('button', { name: 'Capability Register', exact: true }).click();
        await expect(this.filterInput()).toBeVisible({ timeout: 15000 });
    }

    // ── Core CRUD ──────────────────────────────────────────────────────────────

    /**
     * Open the Add Capability modal
     */
    async openAddModal(): Promise<void> {
        await this.page.locator('button[title="Add Capability"]').first().click();
        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.locator('h3').filter({ hasText: /Add Capability/i })).toBeVisible({ timeout: 5000 });
    }

    /**
     * Create a capability with provided data
     */
    async create(
        capabName: string,
        details?: string,
        owner?: string,
        category?: string,
    ): Promise<{ id: string; capabName: string }> {
        await this.openAddModal();
        const dialog = this.page.locator('[role="dialog"]').first();

        // Fill in name (required)
        await dialog.locator('input[name="capab_name"]').fill(capabName);

        // Fill in details/notes if provided (capab_other_details textarea)
        if (details) {
            await dialog.locator('textarea[name="capab_other_details"]').fill(details);
        }

        // Fill in owner if provided
        if (owner) {
            const ownerInput = dialog.locator('input[placeholder*="Select owner"]').first();
            await ownerInput.fill(owner);
            await this.page.waitForTimeout(400);
            // Click the matching option if available
            const option = this.page.locator('[role="option"]').filter({ hasText: owner }).first();
            if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
                await option.click();
            }
        }

        // Submit (no category field in add modal, skip)
        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/capabilities') && res.request().method() === 'POST',
                { timeout: 15000 },
            ),
            dialog.locator('button[type="submit"]').click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[create] POST /api/capabilities failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);
        await expect(dialog).not.toBeVisible({ timeout: 10000 });

        // Verify the capability appears in the table
        await this.filterInput().fill(capabName);
        const row = this.page.locator('tbody tr:visible').filter({ hasText: capabName }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await this.filterInput().clear();

        // Extract ID from response
        const responseBody = await response.json();
        return { id: responseBody.id, capabName };
    }

    /**
     * Filter for capability and open the View modal for the first matching row
     */
    async openView(capabName: string): Promise<any> {
        await this.filterInput().fill(capabName);
        await this.page.waitForTimeout(400);
        const row = this.page.locator('tbody tr:visible').filter({ hasText: capabName }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.locator('h3').filter({ hasText: /View Capability/i })).toBeVisible({ timeout: 5000 });
        await this.filterInput().clear();

        return dialog;
    }

    /**
     * Edit a capability: open view → click Edit → modify → save
     */
    async edit(capabName: string, newCategory?: string): Promise<void> {
        const dialog = await this.openView(capabName);

        // Click Edit button
        await dialog.locator('button[title="Edit"]').click();
        await this.page.waitForTimeout(300);

        const editDialog = this.page.locator('[role="dialog"]').filter({ hasText: /Edit Capability/i }).first();
        await expect(editDialog).toBeVisible({ timeout: 10000 });

        // Edit the category if provided
        if (newCategory) {
            const categorySelect = editDialog.locator('select[name="category"]').first();
            await categorySelect.selectOption(newCategory);
        }

        // Submit
        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/capabilities') && res.request().method() === 'PUT',
                { timeout: 15000 },
            ),
            editDialog.locator('button[type="submit"]').click(),
        ]);
        expect(response.status()).toBeLessThan(300);
        await expect(editDialog).not.toBeVisible({ timeout: 10000 });
    }

    /**
     * Delete a capability by name
     */
    async delete(capabName: string): Promise<void> {
        const dialog = await this.openView(capabName);

        // Click Delete button in the view dialog header
        const deleteBtn = dialog.locator('button[title="Delete"]').first();
        await deleteBtn.click({ force: true });
        await this.page.waitForTimeout(300);

        // Wait for confirmation and click the delete confirm button
        const confirmBtn = this.page.locator('button').filter({ hasText: /^Delete$/ }).last();
        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/capabilities') && res.request().method() === 'DELETE',
                { timeout: 15000 },
            ),
            confirmBtn.click({ force: true }),
        ]);
        expect(response.status()).toBeLessThan(300);

        await this.filterInput().clear();
    }

    // ── Table Filtering & Sorting ──────────────────────────────────────────────

    /**
     * Sort by column (click the column header to toggle ascending/descending)
     */
    async sortByColumn(columnName: string): Promise<void> {
        const header = this.page.locator('th').filter({
            has: this.page.locator('button', { hasText: new RegExp(`^${columnName}$`, 'i') }),
        }).first();
        await header.locator('button').first().click({ force: true });
        await this.page.waitForTimeout(500);
    }

    /**
     * Get current page and total pages from pagination UI
     */
    async getCurrentPage(): Promise<[number, number]> {
        const paginationText = await this.page.locator('[data-testid="pagination-info"]').textContent();
        if (!paginationText) return [1, 1];
        const match = paginationText.match(/Page (\d+) of (\d+)/);
        if (!match) return [1, 1];
        return [parseInt(match[1]), parseInt(match[2])];
    }

    /**
     * Go to next page
     */
    async nextPage(): Promise<boolean> {
        const btn = this.page.locator('button[title="Next Page"]').first();
        if (await btn.isDisabled()) return false;
        await btn.click();
        await this.page.waitForTimeout(500);
        return true;
    }

    /**
     * Go to previous page
     */
    async previousPage(): Promise<boolean> {
        const btn = this.page.locator('button[title="Previous Page"]').first();
        if (await btn.isDisabled()) return false;
        await btn.click();
        await this.page.waitForTimeout(500);
        return true;
    }

    // ── Selection & Bulk Operations ────────────────────────────────────────────

    /**
     * Select a capability row by name
     */
    async selectCapability(capabName: string): Promise<void> {
        const row = this.page.locator('tbody tr').filter({ hasText: capabName }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        const checkbox = row.locator('input[type="checkbox"]').first();
        await checkbox.check();
        await this.page.waitForTimeout(300);
    }

    /**
     * Bulk delete selected capabilities
     */
    async bulkDelete(): Promise<void> {
        const actionBar = this.page.locator('.fixed.bottom-6').first();
        await expect(actionBar).toBeVisible({ timeout: 5000 });

        // Click Delete button with force to bypass z-index issues
        const deleteBtn = actionBar.locator('button').filter({ hasText: /^Delete$/ }).first();
        await deleteBtn.click({ force: true });
        await this.page.waitForTimeout(300);

        // Confirm delete with force
        const confirmBtn = actionBar.locator('button').filter({ hasText: /^Confirm$/ }).first();
        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/capabilities') && res.request().method() === 'DELETE',
                { timeout: 45000 },
            ),
            confirmBtn.click({ force: true }),
        ]);
        expect(response.status()).toBeLessThan(300);

        // Wait for action bar to disappear
        await expect(actionBar).not.toBeVisible({ timeout: 10000 });
    }

    // ── Custom Fields ──────────────────────────────────────────────────────────

    /**
     * Create a custom field
     */
    async createCustomField(fieldName: string, fieldLabel: string): Promise<void> {
        const manageBtn = this.page.locator('button[title="Manage Columns"]').first();
        await manageBtn.click({ force: true });
        await this.page.waitForTimeout(300);
        const modal = this.page.locator('[role="dialog"]').filter({ hasText: /Manage.*Custom Columns/i }).first();
        await expect(modal).toBeVisible({ timeout: 10000 });

        // Find "Add Custom Field" button and click
        await modal.locator('button').filter({ hasText: /Add Custom Field/i }).first().click();
        await this.page.waitForTimeout(300);

        // Fill in field name and label
        const nameInput = modal.locator('input[placeholder*="field name"]').first();
        const labelInput = modal.locator('input[placeholder*="field label"]').first();
        await nameInput.fill(fieldName);
        await labelInput.fill(fieldLabel);

        // Save
        await modal.locator('button[type="submit"]').filter({ hasText: /Save/i }).first().click();
        await this.page.waitForTimeout(500);

        // Close modal
        await modal.locator('button').filter({ hasText: /Close|Done/i }).first().click();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    }

    /**
     * Delete a custom field by label
     */
    async deleteCustomField(fieldLabel: string): Promise<void> {
        await this.page.locator('button[title="Manage Columns"]').first().click();
        const modal = this.page.locator('[role="dialog"]').filter({ hasText: /Manage.*Custom Columns/i }).first();
        await expect(modal).toBeVisible({ timeout: 10000 });

        // Find the field and click delete
        const fieldDiv = modal.locator('div').filter({ hasText: fieldLabel }).first();
        const deleteBtn = fieldDiv.locator('button[title="Delete"]').first();
        await deleteBtn.click();
        await this.page.waitForTimeout(500);

        // Close modal
        await modal.locator('button').filter({ hasText: /Close|Done/i }).first().click();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    }

    // ── CSV Import ─────────────────────────────────────────────────────────────

    /**
     * Write CSV to temp file and trigger upload
     */
    writeTempCSV(content: string): string {
        const tmpDir = os.tmpdir();
        const filename = `e2e-capab-${Date.now()}.csv`;
        const filepath = path.join(tmpDir, filename);
        fs.writeFileSync(filepath, content, 'utf-8');
        return filepath;
    }

    /**
     * Trigger CSV file upload
     */
    async triggerCSVUpload(filePath: string): Promise<void> {
        const fileInput = this.page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(filePath);
        await this.page.waitForTimeout(500);
    }

    /**
     * Confirm column mapping in import modal
     */
    async confirmMapping(): Promise<void> {
        const modal = this.page.locator('[role="dialog"]').filter({ hasText: /Map CSV Columns/i }).first();
        await expect(modal).toBeVisible({ timeout: 10000 });
        await modal.locator('button').filter({ hasText: /Review Data|Confirm/i }).first().click();
        await this.page.waitForTimeout(500);
    }

    /**
     * Confirm new custom fields creation in import
     */
    async confirmNewFields(): Promise<void> {
        const modal = this.page.locator('[role="dialog"]').filter({ hasText: /New Custom Fields/i }).first();
        await expect(modal).toBeVisible({ timeout: 10000 });
        await modal.locator('button').filter({ hasText: /Create|Confirm/i }).first().click();
        await this.page.waitForTimeout(500);
    }

    /**
     * Confirm final import
     */
    async confirmImport(): Promise<void> {
        const modal = this.page.locator('[role="dialog"]').filter({ hasText: /Import Confirmation|Import/i }).first();
        await expect(modal).toBeVisible({ timeout: 10000 });
        await modal.locator('button').filter({ hasText: /^Import$/i }).first().click();
        await this.page.waitForTimeout(500);
    }

    /**
     * Export capabilities as CSV
     */
    async exportCSV(): Promise<string> {
        const downloadPromise = this.page.waitForEvent('download', { timeout: 15000 });
        const exportBtn = this.page.locator('button[title="Export CSV"]').first();
        await exportBtn.click({ force: true });
        const download = await downloadPromise;
        return download.suggestedFilename;
    }
}
