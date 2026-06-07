import { expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * AssetRelationshipActions — helper for Governance → Asset Relationships E2E tests.
 *
 * API endpoints used:
 *   POST   /api/assets/relationships       (add)
 *   PUT    /api/assets/relationships/:id   (edit)
 *   DELETE /api/assets/relationships/:id   (single delete)
 *   DELETE /api/assets/relationships/bulk  (bulk delete)
 *   POST   /api/assets/relationships/bulk  (CSV import)
 *   GET    /api/custom-fields/asset_relationships
 *   POST   /api/custom-fields/asset_relationships
 *   DELETE /api/custom-fields/asset_relationships/:id
 */
export class AssetRelationshipActions {
    constructor(private page: Page) {}

    filterInput() {
        return this.page.getByPlaceholder('Filter relationships...').first();
    }

    // ── Navigation ─────────────────────────────────────────────────────────────

    async navigate(): Promise<void> {
        await this.page.getByRole('button', { name: /Governance/i }).click();
        await this.page.getByRole('button', { name: 'Asset Relationships', exact: true }).click();
        await expect(this.filterInput()).toBeVisible({ timeout: 15000 });
    }

    // ── Stale dialog cleanup (called defensively before row interactions) ────────

    /**
     * Dismiss any stale view/edit/add modal (role=dialog) and any stale delete-confirm
     * div (fixed inset-0 z-50). Safe to call even when nothing is open.
     */
    private async dismissStaleDialogs(): Promise<void> {
        // 1. Close role="dialog" (Modal component) if visible
        const staleModal = this.page.locator('[role="dialog"]').first();
        if (await staleModal.isVisible({ timeout: 600 }).catch(() => false)) {
            // Try Close-modal aria-label first, then Escape
            const closeBtn = staleModal.locator('[aria-label="Close modal"]');
            if (await closeBtn.isVisible({ timeout: 400 }).catch(() => false)) {
                await closeBtn.click().catch(() => {});
            } else {
                await this.page.keyboard.press('Escape');
            }
            await this.page.waitForTimeout(400);
        }
        // 2. Close delete-confirm overlay (fixed inset-0 z-50) if visible
        const staleConfirm = this.page.locator('.fixed.inset-0.z-50.overflow-y-auto').first();
        if (await staleConfirm.isVisible({ timeout: 600 }).catch(() => false)) {
            const cancelBtn = staleConfirm.locator('button').filter({ hasText: /^Cancel$/ }).first();
            await cancelBtn.click({ force: true }).catch(() => {});
            await this.page.waitForTimeout(400);
        }
    }

    // ── Asset ID discovery ─────────────────────────────────────────────────────

    /**
     * Opens the Add modal, reads asset IDs from the source dropdown,
     * closes the modal, and returns the list. Throws if fewer than 2 assets available.
     */
    async getAvailableAssetIds(): Promise<string[]> {
        await this.page.locator('button[title="Add Relationship"]:visible').first().click();
        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });

        const options = await dialog.locator('select[name="source_asset_id"] option').all();
        const ids: string[] = [];
        for (const opt of options) {
            const val = await opt.getAttribute('value');
            if (val && val.trim()) ids.push(val.trim());
        }

        await dialog.locator('button').filter({ hasText: /Cancel/i }).first().click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });

        if (ids.length < 2) {
            throw new Error(`Need ≥2 assets in the tenant; found ${ids.length}.`);
        }
        return ids;
    }

    // ── Core CRUD ──────────────────────────────────────────────────────────────

    /**
     * Create a relationship. Auto-selects the first two available assets if not provided.
     * Returns { sourceId, targetId, type } for subsequent locate/cleanup.
     */
    async create(
        sourceId?: string,
        targetId?: string,
        relationshipType = 'Connected To',
    ): Promise<{ sourceId: string; targetId: string; type: string }> {
        await this.page.locator('button[title="Add Relationship"]:visible').first().click();
        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.locator('h3').filter({ hasText: 'Add Relationship' })).toBeVisible({ timeout: 5000 });

        if (!sourceId || !targetId) {
            const options = await dialog.locator('select[name="source_asset_id"] option').all();
            const available: string[] = [];
            for (const opt of options) {
                const val = await opt.getAttribute('value');
                if (val && val.trim()) available.push(val.trim());
            }
            if (available.length < 2) throw new Error(`Need ≥2 assets; found ${available.length}.`);
            sourceId ??= available[0];
            targetId ??= available[1];
        }

        await dialog.locator('select[name="source_asset_id"]').selectOption(sourceId!);
        await dialog.locator('select[name="target_asset_id"]').selectOption(targetId!);
        await dialog.locator('select[name="relationship_type"]').selectOption(relationshipType);

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets/relationships') && res.request().method() === 'POST',
                { timeout: 15000 },
            ),
            dialog.locator('button[type="submit"]').click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[create] POST /api/assets/relationships failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);
        await expect(dialog).not.toBeVisible({ timeout: 10000 });

        await this.filterInput().fill(sourceId!);
        await expect(
            this.page.locator('tbody tr:visible').filter({ hasText: sourceId! }).first(),
        ).toBeVisible({ timeout: 10000 });
        await this.filterInput().clear();

        return { sourceId: sourceId!, targetId: targetId!, type: relationshipType };
    }

    /**
     * Filter for sourceId and open the View modal for the first matching row.
     * Dismisses any stale dialogs first to avoid intercept errors.
     * Returns the dialog locator.
     */
    async openView(sourceId: string): Promise<ReturnType<Page['locator']>> {
        await this.dismissStaleDialogs();

        await this.filterInput().fill(sourceId);
        const row = this.page.locator('tbody tr:visible').filter({ hasText: sourceId }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();
        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await expect(dialog.locator('h3').filter({ hasText: 'View Relationship' })).toBeVisible({ timeout: 5000 });
        return dialog;
    }

    /**
     * Edit a relationship's type via View → Edit header button → change type → Save.
     */
    async edit(sourceId: string, newType: string): Promise<void> {
        const dialog = await this.openView(sourceId);
        await dialog.locator('button[title="Edit"]').first().click();
        await expect(dialog.locator('h3').filter({ hasText: 'Edit Relationship' })).toBeVisible({ timeout: 5000 });

        await dialog.locator('select[name="relationship_type"]').selectOption(newType);

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets/relationships') && res.request().method() === 'PUT',
                { timeout: 15000 },
            ),
            dialog.locator('button[type="submit"]').click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[edit] PUT /api/assets/relationships failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);
        await expect(dialog).not.toBeVisible({ timeout: 10000 });
        await this.filterInput().clear();
    }

    /**
     * Delete a relationship via View modal → Delete header button → confirm div.
     * Mirrors the AssetActions.delete() pattern which is known to work.
     */
    async delete(sourceId: string): Promise<void> {
        const dialog = await this.openView(sourceId);

        // Click Delete in the view modal header — triggers onClose()+onDelete() which:
        // 1. Unmounts the Modal (isOpen → false, returns null)
        // 2. Shows the confirm div (modalState.type = 'delete') at z-50
        await dialog.locator('button[title="Delete"]').first().click();

        // The confirm div is .fixed.inset-0.z-50.overflow-y-auto (NOT role="dialog")
        const confirmDiv = this.page.locator('.fixed.inset-0.z-50.overflow-y-auto').first();
        await expect(confirmDiv).toBeVisible({ timeout: 5000 });

        const confirmHeading = confirmDiv.locator('h3').filter({ hasText: 'Delete Relationship' }).first();
        await expect(confirmHeading).toBeVisible({ timeout: 5000 });

        // Scope the delete button to the confirm div to avoid picking SelectionActionBar's Delete
        const deleteConfirmBtn = confirmDiv.locator('button.bg-red-600');
        await expect(deleteConfirmBtn).toBeVisible({ timeout: 5000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets/relationships') && res.request().method() === 'DELETE',
                { timeout: 20000 },
            ),
            deleteConfirmBtn.click(),
        ]);
        const status = response.status();
        if (![200, 204].includes(status)) {
            const body = await response.text().catch(() => '');
            console.error(`[delete] DELETE /api/assets/relationships failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect([200, 204]).toContain(status);
        await this.filterInput().clear();
    }

    // ── Bulk operations ────────────────────────────────────────────────────────

    /**
     * Filter for sourceId, check the row's checkbox, then clear the filter.
     */
    async selectRow(sourceId: string): Promise<void> {
        await this.filterInput().fill(sourceId);
        await this.page.waitForTimeout(400);
        const row = this.page.locator('tbody tr:visible').filter({ hasText: sourceId }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        const checkbox = row.locator('input[type="checkbox"]').first();
        if (!(await checkbox.isChecked())) {
            await checkbox.click();
            await expect(checkbox).toBeChecked({ timeout: 5000 });
        }
        await this.filterInput().clear();
        await this.page.waitForTimeout(300);
    }

    /**
     * Trigger bulk delete from the SelectionActionBar: Delete → Confirm.
     * Waits for the bulk DELETE API response before returning.
     */
    async bulkDelete(): Promise<void> {
        const actionBar = this.page.locator('.fixed.bottom-6').first();
        await expect(actionBar).toBeVisible({ timeout: 5000 });

        await actionBar.locator('button').filter({ hasText: /^Delete$/ }).first().click();
        // After clicking Delete, isConfirmingDelete=true → shows "Delete N item(s)?"
        await expect(actionBar.locator('span').filter({ hasText: /Delete \d+ item/ })).toBeVisible({ timeout: 5000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets/relationships') && res.request().method() === 'DELETE',
                { timeout: 20000 },
            ),
            actionBar.locator('button').filter({ hasText: /^Confirm$/ }).first().click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[bulkDelete] DELETE /api/assets/relationships/bulk failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);
        // Allow BulkProgressModal to show and auto-dismiss
        await this.page.waitForTimeout(3500);
        // Wait for the action bar to disappear
        await expect(actionBar).not.toBeVisible({ timeout: 10000 });
    }

    /**
     * Cleanup substitute for delete() while deleteAssetRelationship() is absent from
     * services/supabase.ts. Selects the row by sourceId and runs the bulk-delete UI
     * flow, which calls the working DELETE /api/assets/relationships/bulk endpoint.
     *
     * Replace all calls to this with delete() once deleteAssetRelationship() is added
     * to the service layer and the single-delete confirm flow is verified working.
     */
    async deleteViaBulk(sourceId: string): Promise<void> {
        await this.selectRow(sourceId);
        await this.bulkDelete();
    }

    /**
     * Enter bulk edit mode via SelectionActionBar → Edit, change the relationship_type
     * for the row matching sourceId (inline select, nth(1) = relationship column), then Save All.
     */
    async bulkEditRelationshipType(sourceId: string, newType: string): Promise<void> {
        const actionBar = this.page.locator('.fixed.bottom-6').first();
        await expect(actionBar).toBeVisible({ timeout: 5000 });
        await actionBar.locator('button').filter({ hasText: /^Edit$/ }).first().click();

        // In edit mode, rows show inline selects; filter to locate target row
        await this.filterInput().fill(sourceId);
        const row = this.page.locator('tbody tr:visible').filter({ hasText: sourceId }).first();
        await expect(row).toBeVisible({ timeout: 5000 });

        // Column order is [source_asset_id, relationship_type, target_asset_id]; nth(1) = type
        await row.locator('select').nth(1).selectOption(newType);
        await this.filterInput().clear();

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets/relationships') && res.request().method() === 'PUT',
                { timeout: 15000 },
            ),
            actionBar.locator('button').filter({ hasText: /^Save All$/ }).first().click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[bulkEdit] PUT /api/assets/relationships failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);
        await this.page.waitForTimeout(500);
    }

    // ── Sort ──────────────────────────────────────────────────────────────────

    /**
     * Click a standard column header button to toggle sort direction.
     * For the Relationship column this opens FilterDropdown — use applyRelTypeFilter() there.
     */
    async sortByColumn(columnTitle: string): Promise<void> {
        const th = this.page.locator('th').filter({
            has: this.page.locator('button').filter({ hasText: new RegExp(columnTitle, 'i') }),
        }).first();
        await th.locator('button').first().click({ force: true });
        await this.page.waitForTimeout(400);
    }

    // ── Column filter (Relationship Type) ──────────────────────────────────────

    /**
     * Open the Relationship Type column filter dropdown and apply a filter for the given type.
     */
    async applyRelTypeFilter(relationshipType: string): Promise<void> {
        const th = this.page.locator('th').filter({
            has: this.page.locator('button').filter({ hasText: /^Relationship$/i }),
        }).first();
        await th.locator('button').first().click({ force: true });

        const dropdown = this.page.locator('.FilterDropdownCore').first();
        await expect(dropdown).toBeVisible({ timeout: 5000 });

        await dropdown
            .locator('label')
            .filter({ hasText: relationshipType })
            .locator('input[type="checkbox"]')
            .click();

        await dropdown.locator('button').filter({ hasText: /^Apply$/ }).click();
        await this.page.waitForTimeout(300);
    }

    /**
     * Clear the Relationship Type column filter.
     * "Clear Filter" may auto-close the dropdown; Apply is only clicked if dropdown stays open.
     */
    async clearRelTypeFilter(): Promise<void> {
        const th = this.page.locator('th').filter({
            has: this.page.locator('button').filter({ hasText: /^Relationship$/i }),
        }).first();
        await th.locator('button').first().click({ force: true });

        const dropdown = this.page.locator('.FilterDropdownCore').first();
        await expect(dropdown).toBeVisible({ timeout: 5000 });
        await dropdown.locator('button').filter({ hasText: /^Clear Filter$/ }).click();

        // After "Clear Filter" the dropdown may auto-close. Only click Apply if still open.
        const isStillOpen = await dropdown.isVisible({ timeout: 600 }).catch(() => false);
        if (isStillOpen) {
            await dropdown.locator('button').filter({ hasText: /^Apply$/ }).click();
        }
        await this.page.waitForTimeout(300);
    }

    // ── Pagination ─────────────────────────────────────────────────────────────

    async getCurrentPage(): Promise<[number, number]> {
        const text = await this.page
            .locator('div')
            .filter({ hasText: /^\d+ of \d+$/ })
            .last()
            .textContent({ timeout: 5000 });
        const match = text?.match(/(\d+)\s+of\s+(\d+)/);
        if (!match) throw new Error(`Cannot parse page info from: "${text}"`);
        return [parseInt(match[1]), parseInt(match[2])];
    }

    async nextPage(): Promise<boolean> {
        const btn = this.page.getByRole('button', { name: /^Next$/i }).first();
        if (await btn.isDisabled()) return false;
        await btn.click();
        await this.page.waitForTimeout(300);
        return true;
    }

    async previousPage(): Promise<boolean> {
        const btn = this.page.getByRole('button', { name: /^Previous$/i }).first();
        if (await btn.isDisabled()) return false;
        await btn.click();
        await this.page.waitForTimeout(300);
        return true;
    }

    // ── Custom fields ──────────────────────────────────────────────────────────

    private manageColumnsModal() {
        return this.page
            .locator('div', { has: this.page.locator('h3', { hasText: /Manage.*Custom Columns/i }) })
            .first();
    }

    async createCustomField(fieldName: string, fieldLabel: string): Promise<void> {
        await this.page.locator('button[title="Manage Columns"]:visible').first().click();
        const modal = this.manageColumnsModal();
        await expect(modal).toBeVisible({ timeout: 10000 });

        await modal.getByRole('button', { name: 'Add Column' }).first().click();
        await modal.locator('input[placeholder="e.g., warranty_expiry"]').first().fill(fieldName);
        await modal.locator('input[placeholder="e.g., Warranty Expiry Date"]').first().fill(fieldLabel);

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/custom-fields') && res.request().method() === 'POST',
                { timeout: 15000 },
            ),
            modal.getByRole('button', { name: /^Add$/ }).first().click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[createCustomField] POST /api/custom-fields failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);

        // Close the modal via its header close button
        await modal
            .locator('div.flex.items-center.justify-between.px-6.py-4')
            .locator('button')
            .last()
            .click();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    }

    async deleteCustomField(fieldLabel: string): Promise<void> {
        await this.page.locator('button[title="Manage Columns"]:visible').first().click();
        const modal = this.manageColumnsModal();
        await expect(modal).toBeVisible({ timeout: 10000 });

        const fieldEntry = modal
            .locator('div.flex.items-center.justify-between.p-3')
            .filter({ hasText: fieldLabel })
            .first();
        await expect(fieldEntry).toBeVisible({ timeout: 5000 });

        this.page.once('dialog', d => d.accept());
        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/custom-fields') && res.request().method() === 'DELETE',
                { timeout: 15000 },
            ),
            fieldEntry.locator('button[title="Delete"]').first().click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[deleteCustomField] DELETE /api/custom-fields failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);

        await expect(
            modal.locator('div.flex.items-center.justify-between.p-3').filter({ hasText: fieldLabel }),
        ).toHaveCount(0, { timeout: 10000 });

        await modal
            .locator('div.flex.items-center.justify-between.px-6.py-4')
            .locator('button')
            .last()
            .click();
        await expect(modal).not.toBeVisible({ timeout: 5000 });
    }

    // ── CSV export ─────────────────────────────────────────────────────────────

    async exportCSV(): Promise<string> {
        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 15000 }),
            this.page.locator('button[title="Export CSV"]:visible').first().dispatchEvent('click'),
        ]);
        const filename = download.suggestedFilename();
        await download.saveAs(path.join(os.tmpdir(), `e2e-${filename}`));
        return filename;
    }

    // ── CSV import helpers ─────────────────────────────────────────────────────

    writeTempCSV(content: string): string {
        const filePath = path.join(os.tmpdir(), `e2e-rel-import-${Date.now()}.csv`);
        fs.writeFileSync(filePath, content, 'utf-8');
        return filePath;
    }

    async triggerCSVUpload(filePath: string): Promise<void> {
        const [fileChooser] = await Promise.all([
            this.page.waitForEvent('filechooser', { timeout: 10000 }),
            this.page.locator('button[title="Import CSV"]:visible').first().click(),
        ]);
        await fileChooser.setFiles(filePath);
        await expect(
            this.page.locator('[role="dialog"]').filter({ hasText: /Map CSV Columns/i }).first(),
        ).toBeVisible({ timeout: 10000 });
    }

    async confirmMapping(): Promise<void> {
        const mappingDialog = this.page
            .locator('[role="dialog"]')
            .filter({ hasText: /Map CSV Columns/i })
            .first();
        await expect(mappingDialog).toBeVisible({ timeout: 5000 });
        await mappingDialog.locator('button').filter({ hasText: /Review Data/i }).click();
    }

    async confirmNewFields(): Promise<void> {
        const newFieldsDialog = this.page
            .locator('[role="dialog"]')
            .filter({ hasText: /New Custom Fields Detected/i })
            .first();
        await expect(newFieldsDialog).toBeVisible({ timeout: 10000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/custom-fields') && res.request().method() === 'POST',
                { timeout: 15000 },
            ),
            newFieldsDialog.locator('button').filter({ hasText: /Confirm & Import Data/i }).click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[confirmNewFields] POST /api/custom-fields failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);
    }

    async confirmImport(): Promise<void> {
        const heading = this.page.locator('h3').filter({ hasText: 'Import Asset Relationships' }).first();
        await expect(heading).toBeVisible({ timeout: 10000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets/relationships') && res.request().method() === 'POST',
                { timeout: 20000 },
            ),
            this.page.locator('button').filter({ hasText: /^Import$/ }).last().click(),
        ]);
        const status = response.status();
        if (status >= 300) {
            const body = await response.text().catch(() => '');
            console.error(`[confirmImport] POST /api/assets/relationships/bulk failed: status=${status} body=${body.slice(0, 200)}`);
        }
        expect(status).toBeLessThan(300);
        await expect(heading).not.toBeVisible({ timeout: 10000 });
    }
}
