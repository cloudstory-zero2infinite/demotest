import { expect, Page } from '@playwright/test';

/**
 * AssetActions — helper for Governance → Assets E2E tests.
 *
 * Design principles (learned from vulnerability-actions pattern):
 * - Always scope locators to `[role="dialog"]` when inside a modal
 * - Use filter input to locate rows — avoids pagination / scroll issues
 * - Return names (not UUIDs) so callers can reference rows via filter
 * - Every create() call uses a timestamp-unique name + IP + MAC
 */
export class AssetActions {
    private filterInput() {
        return this.page.getByPlaceholder('Filter assets...').first();
    }

    constructor(private page: Page) { }

    // ── Navigation ─────────────────────────────────────────────────────────────

    async navigate() {
        await this.page.getByRole('button', { name: /Governance/i }).click();
        await this.page.getByRole('button', { name: 'Assets', exact: true }).click();
        await expect(this.filterInput()).toBeVisible({ timeout: 15000 });
        await this.page.waitForLoadState('networkidle');
    }

    // ── Phase 1: Core CRUD ────────────────────────────────────────────────────

    /**
     * Create a new standard asset.
     * Returns the name so callers can locate the row via the filter input.
     */
    async create(name: string): Promise<string> {
        await this.page.locator('button[title="Add Asset"]').first().click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.locator('h3').filter({ hasText: 'Add New Asset' })).toBeVisible({ timeout: 5000 });

        const ts = Date.now();
        const ip = `10.${(ts >> 16) & 0xFE}.${(ts >> 8) & 0xFE}.${(ts & 0xFE) || 2}`;
        const h = ts.toString(16).padStart(12, '0').slice(-12);
        const mac = `${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}:${h.slice(6, 8)}:${h.slice(8, 10)}:${h.slice(10, 12)}`.toUpperCase();

        await dialog.locator('input[name="name"]').fill(name);
        await dialog.locator('input[name="asset_owner"]').fill('E2E Owner');
        await dialog.locator('input[name="business_unit"]').fill('E2E-BU');
        await dialog.locator('input[name="ip_address"]').fill(ip);
        await dialog.locator('input[name="mac_id"]').fill(mac);
        await dialog.locator('textarea[name="details"]').fill('Created by E2E automation');

        await this.page.waitForTimeout(300);

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets') && res.request().method() === 'POST',
                { timeout: 20000 }
            ),
            dialog.locator('button[type="submit"]').click(),
        ]);
        expect(response.status()).toBeLessThan(300);

        await expect(dialog).not.toBeVisible({ timeout: 10000 });

        await this.filterInput().fill(name);
        await expect(
            this.page.locator('tbody tr').filter({ hasText: name }).first()
        ).toBeVisible({ timeout: 15000 });
        await this.filterInput().clear();

        return name;
    }

    /**
     * Edit an existing asset's owner field.
     * Flow: filter → click row → View modal → click Edit → wait for editable input → fill → Save
     */
    async edit(name: string, newOwner: string): Promise<void> {
        await this.filterInput().fill(name);
        const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.locator('h3').filter({ hasText: 'View Asset' })).toBeVisible({ timeout: 5000 });

        // Click the Edit action in the modal header and wait for edit mode
        const editBtn = dialog.locator('button[title="Edit"]').first();
        await expect(editBtn).toBeVisible({ timeout: 5000 });
        await editBtn.click({ force: true });
        await expect(dialog.locator('h3').filter({ hasText: 'Edit Asset' })).toBeVisible({ timeout: 10000 });

        const ownerInput = dialog.locator('input[name="asset_owner"]');
        await expect(ownerInput).toBeVisible({ timeout: 5000 });
        // Allow more time for UI state change (some animations/update delays observed)
        await expect(ownerInput).not.toHaveAttribute('readonly', { timeout: 15000 });
        // React 19 controlled inputs ignore fill()/pressSequentially because the value prop
        // re-asserts the state value on every render. Use the native value setter to bypass
        // React's wrapper, then dispatch 'input' + 'change' events so React's onChange handler
        // picks up the new value and updates formData state.
        await ownerInput.evaluate((el, value) => {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            nativeInputValueSetter?.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }, newOwner);
        // Wait for React to commit the formData state update before submitting.
        await this.page.waitForTimeout(800);
        await expect(ownerInput).toHaveValue(newOwner, { timeout: 5000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets') &&
                    (res.request().method() === 'PUT' || res.request().method() === 'PATCH'),
                { timeout: 20000 }
            ),
            dialog.locator('button[type="submit"]').click(),
        ]);
        expect(response.status()).toBeLessThan(300);
        await expect(dialog).not.toBeVisible({ timeout: 10000 });
        // Wait for the assets list to refresh (fetch triggered by save handler)
        await this.page.waitForResponse(
            res => res.url().includes('/api/assets') && res.request().method() === 'GET',
            { timeout: 10000 }
        ).catch(() => {/* non-fatal: proceed even if GET not observed */});
        await this.filterInput().clear();
    }

    /**
     * Delete an asset by name.
     * Flow: filter → click row → View modal → Delete button → confirm dialog → Delete
     */
    async delete(name: string): Promise<void> {
        await this.filterInput().fill(name);
        const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });

        await dialog.locator('button[title="Delete"]').first().click();

        // Delete confirm is a custom div (not Modal component)
        const confirmHeading = this.page.locator('h3').filter({ hasText: 'Delete Asset' }).first();
        await expect(confirmHeading).toBeVisible({ timeout: 5000 });

        const deleteConfirmBtn = this.page.locator('button.bg-red-600').filter({ hasText: /Delete/ }).first();
        await expect(deleteConfirmBtn).toBeVisible({ timeout: 5000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/assets') && res.request().method() === 'DELETE',
                { timeout: 20000 }
            ),
            deleteConfirmBtn.click(),
        ]);
        expect([200, 204]).toContain(response.status());

        await expect(this.page.getByText('No assets found.').first()).toBeVisible({ timeout: 10000 });
        await this.filterInput().clear();
    }

    // ── Phase 2: Delete verify + Custom Field + Export CSV ────────────────────

    /**
     * Create a custom field via Manage Columns panel.
     * Returns the fieldLabel so callers can verify the column appears.
     * Flow: click Manage Columns → Add Column → fill form → submit → close panel
     */
    async createCustomField(fieldName: string, fieldLabel: string): Promise<string> {
        // Click the visible Manage Columns button
        const manageBtn = this.page.locator('button[title="Manage Columns"]:visible').first();
        await expect(manageBtn).toBeVisible({ timeout: 5000 });
        await manageBtn.click();

        // Wait for the manager modal root and title
        const managerModal = this.page.locator('div', { has: this.page.locator('h3', { hasText: /Manage.*Custom Columns/i }) }).first();
        await expect(managerModal).toBeVisible({ timeout: 10000 });
        const panelHeading = managerModal.locator('h3').filter({ hasText: /Manage.*Custom Columns/i }).first();
        await expect(panelHeading).toBeVisible({ timeout: 10000 });

        // Click Add Column
        await managerModal.getByRole('button', { name: 'Add Column' }).first().click();
        await expect(managerModal.locator('text=Add New Column').first()).toBeVisible({ timeout: 5000 });

        // Fill internal field name (placeholder: "e.g., warranty_expiry")
        await managerModal.locator('input[placeholder="e.g., warranty_expiry"]').first().fill(fieldName);
        // Fill display label (placeholder: "e.g., Warranty Expiry Date")
        await managerModal.locator('input[placeholder="e.g., Warranty Expiry Date"]').first().fill(fieldLabel);

        // Submit — waits for the custom fields API call
        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => (res.url().includes('/api/asset-custom-fields') || res.url().includes('/api/custom-fields')) && res.request().method() === 'POST',
                { timeout: 15000 }
            ),
            managerModal.getByRole('button', { name: /^Add$/ }).first().click(),
        ]);
        expect(response.status()).toBeLessThan(300);

        // Close panel via the header close button
        const closeBtn = managerModal.locator('div.flex.items-center.justify-between.px-6.py-4').locator('button').last();
        await expect(closeBtn).toBeVisible({ timeout: 5000 });
        await closeBtn.click();
        await expect(managerModal).not.toBeVisible({ timeout: 5000 });

        return fieldLabel;
    }

    /**
     * Delete a custom field by its label via Manage Columns panel.
     * Used for cleanup after custom field tests.
     */
    async deleteCustomField(fieldLabel: string): Promise<void> {
        // Click the visible Manage Columns button
        const manageBtn = this.page.locator('button[title="Manage Columns"]:visible').first();
        await expect(manageBtn).toBeVisible({ timeout: 5000 });
        await manageBtn.click();

        // Wait for the manager modal root and title
        const managerModal = this.page.locator('div', { has: this.page.locator('h3', { hasText: /Manage.*Custom Columns/i }) }).first();
        await expect(managerModal).toBeVisible({ timeout: 10000 });
        const panelHeading = managerModal.locator('h3').filter({ hasText: /Manage.*Custom Columns/i }).first();
        await expect(panelHeading).toBeVisible({ timeout: 10000 });

        // Find the field entry row inside the modal and click its Delete button
        const fieldEntry = managerModal.locator('div.flex.items-center.justify-between.p-3').filter({ hasText: fieldLabel }).first();
        await expect(fieldEntry).toBeVisible({ timeout: 5000 });

        // Accept browser confirm dialog before clicking delete (compat)
        this.page.once('dialog', d => d.accept());

        const [delResp] = await Promise.all([
            this.page.waitForResponse(
                res => (res.url().includes('/api/asset-custom-fields') || res.url().includes('/api/custom-fields')) && res.request().method() === 'DELETE',
                { timeout: 15000 }
            ),
            fieldEntry.locator('button[title="Delete"]').first().click(),
        ]);
        expect(delResp.status()).toBeLessThan(300);

        // Wait for the field row to disappear from the modal
        await expect(managerModal.locator('div.flex.items-center.justify-between.p-3').filter({ hasText: fieldLabel })).toHaveCount(0, { timeout: 10000 });

        // Close panel via the header close button
        const closeBtn = managerModal.locator('div.flex.items-center.justify-between.px-6.py-4').locator('button').last();
        await expect(closeBtn).toBeVisible({ timeout: 5000 });
        await closeBtn.click();
        await expect(managerModal).not.toBeVisible({ timeout: 5000 });
    }

    /**
     * Trigger CSV export and capture the download.
     * Returns the suggested filename from the browser download event.
     */
    async exportCSV(): Promise<string> {
        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 15000 }),
            this.page.locator('[data-testid="assets-export-csv"]').filter({ visible: true }).first().click(),
        ]);

        const filename = download.suggestedFilename();
        // Save to a temp path to complete the download
        await download.saveAs(`/tmp/e2e-${filename}`);
        return filename;
    }

    // ── Phase 3: Filter, Sort, Pagination, Bulk ────────────────────────────────

    /**
     * Sort by a column header by clicking directly on the column header cell.
     * The sort toggles: none → ascending → descending → none
     */
    async sortByColumn(columnName: string): Promise<void> {
        // Find the th element containing this column, then close any open filter dropdown first
        const filterDropdown = this.page.locator('[role="dialog"], .FilterDropdownCore').first();
        if (await filterDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(200);
        }

        // Find the table header with this column name
        const th = this.page.locator('th').filter({ 
            has: this.page.locator('button').filter({ hasText: new RegExp(columnName, 'i') })
        }).first();
        await expect(th).toBeVisible({ timeout: 5000 });

        // The button inside the th is what we need to click
        // But we need to be careful: if filter is enabled, clicking opens filter instead of sorting
        // So let's try clicking with more force and wait longer
        const btn = th.locator('button').first();
        await expect(btn).toBeVisible({ timeout: 5000 });

        // Try clicking with force to bypass overlays
        await btn.click({ force: true });

        // Wait a bit for any UI updates
        await this.page.waitForTimeout(800);
        await this.page.waitForLoadState('networkidle');

        // If a filter dropdown opened, close it
        if (await filterDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(200);
        }
    }

    /**
     * Navigate to the next page via pagination controls.
     * Returns true if navigation succeeded, false if already on last page.
     */
    async nextPage(): Promise<boolean> {
        const nextBtn = this.page.locator('button[title*="next"], button[title*="Next"]').first();
        const isDisabled = await nextBtn.isDisabled();
        if (isDisabled) return false;

        await nextBtn.click();
        await this.page.waitForTimeout(300);
        await this.page.waitForLoadState('networkidle');
        return true;
    }

    /**
     * Navigate to the previous page via pagination controls.
     * Returns true if navigation succeeded, false if already on first page.
     */
    async previousPage(): Promise<boolean> {
        const prevBtn = this.page.locator('button[title*="previous"], button[title*="Previous"], button[title*="prev"], button[title*="Prev"]').first();
        const isDisabled = await prevBtn.isDisabled();
        if (isDisabled) return false;

        await prevBtn.click();
        await this.page.waitForTimeout(300);
        await this.page.waitForLoadState('networkidle');
        return true;
    }

    /**
     * Get the current page number from pagination display.
     * Returns a tuple [currentPage, totalPages].
     */
    async getCurrentPage(): Promise<[number, number]> {
        // Look for text like "1 of 5"
        const pageInfo = this.page.locator('text=/Page|^\\d+ of \\d+/').first();
        await expect(pageInfo).toBeVisible({ timeout: 5000 });
        const text = await pageInfo.textContent();
        
        if (!text) throw new Error('Page info text not found');
        
        // Try to extract numbers from "X of Y" or "Page X of Y"
        const match = text.match(/(\d+)\s+of\s+(\d+)/);
        if (!match) throw new Error(`Could not parse page numbers from: ${text}`);
        
        return [parseInt(match[1]), parseInt(match[2])];
    }

    /**
     * Select multiple assets by name via checkboxes.
     * Locates each row by filtering, then checks the checkbox.
     */
    async selectAssets(names: string[]): Promise<void> {
        for (const name of names) {
            await this.filterInput().fill(name);
            await this.page.waitForTimeout(500);

            const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
            await expect(row).toBeVisible({ timeout: 10000 });

            // Find the checkbox - it's typically in a <td> at the start of the row
            const checkbox = row.locator('input[type="checkbox"]').first();
            await expect(checkbox).toBeVisible({ timeout: 5000 });
            
            // Ensure we scroll it into view
            await checkbox.scrollIntoViewIfNeeded();
            await this.page.waitForTimeout(200);

            const isChecked = await checkbox.isChecked();
            if (!isChecked) {
                // Try clicking with force if normal click doesn't work
                try {
                    await checkbox.click();
                } catch {
                    await checkbox.click({ force: true });
                }
                await this.page.waitForTimeout(300);
                
                // Verify the checkbox got checked
                await expect(checkbox).toBeChecked({ timeout: 5000 });
            }

            await this.filterInput().clear();
            await this.page.waitForTimeout(300);
        }
    }

    /**
     * Get the count of currently selected assets.
     * Looks for text indicating selection count in the SelectionActionBar.
     */
    async getSelectionCount(): Promise<number> {
        // Try multiple patterns to find selection text
        const patterns = [
            'text=/\\d+\\s+selected/i',
            'text=/Selected:\\s+\\d+/i',
            'text=/\\d+\\s+item.*selected/i',
        ];

        for (const pattern of patterns) {
            try {
                const element = this.page.locator(pattern).first();
                const text = await element.textContent({ timeout: 2000 });
                if (text) {
                    const match = text.match(/(\d+)/);
                    if (match) return parseInt(match[1]);
                }
            } catch {
                // Pattern didn't match, try next
                continue;
            }
        }

        // Fallback: look for any visible SelectionActionBar and count checked checkboxes
        const checkedBoxes = await this.page.locator('input[type="checkbox"]:checked').count();
        return checkedBoxes;
    }

    /**
     * Perform bulk delete on selected assets via the SelectionActionBar.
     * Waits for the delete confirmation and operation to complete.
     */
    async bulkDelete(): Promise<number> {
        // Find the Delete button in SelectionActionBar (usually red)
        const deleteBtn = this.page.locator('button').filter({ hasText: /Delete|Remove/ }).filter({ has: this.page.locator('svg') }).first();
        await expect(deleteBtn).toBeVisible({ timeout: 10000 });

        await deleteBtn.click();
        await this.page.waitForTimeout(300);

        // Look for bulk operation modal or confirmation dialog
        const modal = this.page.locator('[role="dialog"]').first();
        
        try {
            await expect(modal).toBeVisible({ timeout: 10000 });
            
            // Wait for the operation to complete (look for a confirm/proceed button)
            const confirmBtn = modal.locator('button').filter({ hasText: /Delete|Confirm|Proceed/ }).first();
            if (await confirmBtn.isVisible({ timeout: 3000 })) {
                await confirmBtn.click();
            }

            // Wait for completion text like "Deleted X assets"
            await expect(modal.locator('text=/Deleted|Complete|Success/')).toBeVisible({ timeout: 30000 });
            
            // Try to extract count from text
            const text = await modal.textContent();
            const match = text?.match(/(\d+)/);
            return match ? parseInt(match[1]) : 1;
        } catch {
            // Modal didn't appear, might be an instant delete or error
            return 0;
        }
    }
}
