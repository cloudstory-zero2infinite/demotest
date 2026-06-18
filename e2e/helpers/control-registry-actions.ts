import { expect, Page } from '@playwright/test';

export class ControlRegistryActions {
    constructor(private page: Page) { }

    private filterInput() {
        return this.page.getByPlaceholder('Filter controls...').first();
    }

    async navigate() {
        await this.page.getByRole('button', { name: /Governance/i }).click();
        await this.page.getByRole('button', { name: 'Control Registry', exact: true }).click();
        await expect(this.page.getByPlaceholder('Filter controls...').first()).toBeVisible({ timeout: 15000 });
        await this.page.waitForLoadState('networkidle');
    }

    async create(name: string): Promise<string> {
        const addBtn = this.page.locator('button[title="Add Control"]').first();
        await expect(addBtn).toBeVisible({ timeout: 10000 });
        await addBtn.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.locator('h3').filter({ hasText: 'Add Control' })).toBeVisible({ timeout: 5000 });

        await dialog.locator('input[name="ctl_name"]').fill(name);
        await this.page.waitForTimeout(300);
        await dialog.locator('textarea[name="ctl_description"]').fill('E2E test control description');
        await dialog.locator('input[name="ctl_ref_fw"]').fill('NIST CSF');
        await dialog.locator('input[name="ctl_other_details"]').fill('E2E other details');

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/control-registry') && res.request().method() === 'POST',
                { timeout: 45000 }
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

    async edit(name: string, newDetails: string): Promise<void> {
        await this.filterInput().fill(name);
        const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.locator('h3').filter({ hasText: 'View Control' })).toBeVisible({ timeout: 5000 });

        const editBtn = dialog.locator('button[title="Edit"]').first();
        await expect(editBtn).toBeVisible({ timeout: 5000 });
        await editBtn.click({ force: true });
        await expect(dialog.locator('h3').filter({ hasText: 'Edit Control' })).toBeVisible({ timeout: 10000 });

        const detailsInput = dialog.locator('input[name="ctl_other_details"]');
        await expect(detailsInput).toBeVisible({ timeout: 5000 });
        await detailsInput.fill(newDetails);
        await expect(detailsInput).toHaveValue(newDetails, { timeout: 5000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/control-registry') &&
                    (res.request().method() === 'PUT' || res.request().method() === 'PATCH'),
                { timeout: 45000 }
            ),
            dialog.locator('button[type="submit"]').click(),
        ]);
        expect(response.status()).toBeLessThan(300);
        await expect(dialog).not.toBeVisible({ timeout: 10000 });

        await this.page.waitForResponse(
            res => res.url().includes('/api/control-registry') && res.request().method() === 'GET',
            { timeout: 10000 }
        ).catch(() => {});
        await this.filterInput().clear();
    }

    async delete(name: string): Promise<void> {
        await this.filterInput().fill(name);
        const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        const dialog = this.page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible({ timeout: 10000 });

        await dialog.locator('button[title="Delete"]').first().click();

        const confirmHeading = this.page.locator('h3').filter({ hasText: 'Delete Control' }).first();
        await expect(confirmHeading).toBeVisible({ timeout: 5000 });

        const deleteConfirmBtn = this.page.locator('button.bg-red-600').filter({ hasText: /Delete/ }).first();
        await expect(deleteConfirmBtn).toBeVisible({ timeout: 5000 });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                res => res.url().includes('/api/control-registry') && res.request().method() === 'DELETE',
                { timeout: 45000 }
            ),
            deleteConfirmBtn.click(),
        ]);
        expect([200, 204]).toContain(response.status());

        await expect(this.page.getByText('No controls found.').first()).toBeVisible({ timeout: 10000 });
        await this.filterInput().clear();
    }

    async createCustomField(fieldName: string, fieldLabel: string): Promise<string> {
        const manageBtn = this.page.locator('button[title="Manage Columns"]:visible').first();
        await expect(manageBtn).toBeVisible({ timeout: 5000 });
        await manageBtn.click();

        const managerModal = this.page.locator('div', { has: this.page.locator('h3', { hasText: /Manage.*Custom Columns/i }) }).first();
        await expect(managerModal).toBeVisible({ timeout: 10000 });

        await managerModal.getByRole('button', { name: 'Add Column' }).first().click();
        await expect(managerModal.locator('text=Add New Column').first()).toBeVisible({ timeout: 5000 });

        await managerModal.locator('input[placeholder="e.g., warranty_expiry"]').first().fill(fieldName);
        await managerModal.locator('input[placeholder="e.g., Warranty Expiry Date"]').first().fill(fieldLabel);

        await this.page.waitForTimeout(300);

        const addBtn = managerModal.locator('form').locator('button').filter({ hasText: 'Add' });
        if (await addBtn.count() === 0) {
            await this.page.waitForTimeout(500);
            return fieldLabel;
        }
        const btn = addBtn.first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ force: true });
        await this.page.waitForTimeout(500);

        return fieldLabel;
    }

    async deleteCustomField(fieldLabel: string): Promise<void> {
        const manageBtn = this.page.locator('button[title="Manage Columns"]:visible').first();
        await expect(manageBtn).toBeVisible({ timeout: 5000 });
        await manageBtn.click();

        const managerModal = this.page.locator('div', { has: this.page.locator('h3', { hasText: /Manage.*Custom Columns/i }) }).first();
        await expect(managerModal).toBeVisible({ timeout: 10000 });

        const fieldEntry = managerModal.locator('div.flex.items-center.justify-between.p-3').filter({ hasText: fieldLabel }).first();
        await expect(fieldEntry).toBeVisible({ timeout: 5000 });

        this.page.once('dialog', d => d.accept());

        const [delResp] = await Promise.all([
            this.page.waitForResponse(
                res => (res.url().includes('/api/control-registry-custom-fields') || res.url().includes('/api/custom-fields')) && res.request().method() === 'DELETE',
                { timeout: 15000 }
            ),
            fieldEntry.locator('button[title="Delete"]').first().click(),
        ]);
        expect(delResp.status()).toBeLessThan(300);

        await expect(managerModal.locator('div.flex.items-center.justify-between.p-3').filter({ hasText: fieldLabel })).toHaveCount(0, { timeout: 10000 });

        const closeBtn = managerModal.locator('div.flex.items-center.justify-between.px-6.py-4').getByRole('button');
        await expect(closeBtn).toBeVisible({ timeout: 5000 });
        await closeBtn.click();
        await expect(managerModal).not.toBeVisible({ timeout: 5000 });
    }

    async exportCSV(): Promise<string> {
        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 15000 }),
            this.page.locator('[data-testid="control-registry-export-csv"]').filter({ visible: true }).first().click(),
        ]);

        const filename = download.suggestedFilename();
        await download.saveAs(`/tmp/e2e-${filename}`);
        return filename;
    }

    async sortByColumn(columnName: string): Promise<void> {
        const filterDropdown = this.page.locator('[role="dialog"], .FilterDropdownCore').first();
        if (await filterDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(200);
        }

        const th = this.page.locator('th').filter({
            has: this.page.locator('button').filter({ hasText: new RegExp(columnName, 'i') })
        }).first();
        await expect(th).toBeVisible({ timeout: 5000 });

        const btn = th.locator('button').first();
        await expect(btn).toBeVisible({ timeout: 5000 });
        await btn.click({ force: true });

        await this.page.waitForTimeout(800);
        await this.page.waitForLoadState('networkidle');

        if (await filterDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(200);
        }
    }

    async nextPage(): Promise<boolean> {
        const nextBtn = this.page.locator('button[title*="next"], button[title*="Next"]').first();
        const isDisabled = await nextBtn.isDisabled();
        if (isDisabled) return false;

        await nextBtn.click();
        await this.page.waitForTimeout(300);
        await this.page.waitForLoadState('networkidle');
        return true;
    }

    async previousPage(): Promise<boolean> {
        const prevBtn = this.page.locator('button[title*="previous"], button[title*="Previous"], button[title*="prev"], button[title*="Prev"]').first();
        const isDisabled = await prevBtn.isDisabled();
        if (isDisabled) return false;

        await prevBtn.click();
        await this.page.waitForTimeout(300);
        await this.page.waitForLoadState('networkidle');
        return true;
    }

    async getCurrentPage(): Promise<[number, number]> {
        const pageInfo = this.page.locator('text=/Page|^\\d+ of \\d+/').first();
        await expect(pageInfo).toBeVisible({ timeout: 5000 });
        const text = await pageInfo.textContent();

        if (!text) throw new Error('Page info text not found');

        const match = text.match(/(\d+)\s+of\s+(\d+)/);
        if (!match) throw new Error(`Could not parse page numbers from: ${text}`);

        return [parseInt(match[1]), parseInt(match[2])];
    }

    async selectControls(names: string[]): Promise<void> {
        for (const name of names) {
            await this.filterInput().fill(name);
            await this.page.waitForTimeout(500);

            const row = this.page.locator('tbody tr').filter({ hasText: name }).first();
            await expect(row).toBeVisible({ timeout: 10000 });

            const checkbox = row.locator('input[type="checkbox"]').first();
            await expect(checkbox).toBeVisible({ timeout: 5000 });

            await checkbox.scrollIntoViewIfNeeded();
            await this.page.waitForTimeout(200);

            const isChecked = await checkbox.isChecked();
            if (!isChecked) {
                try {
                    await checkbox.click();
                } catch {
                    await checkbox.click({ force: true });
                }
                await this.page.waitForTimeout(300);

                await expect(checkbox).toBeChecked({ timeout: 5000 });
            }

            await this.filterInput().clear();
            await this.page.waitForTimeout(300);
        }
    }

    async getSelectionCount(): Promise<number> {
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
                continue;
            }
        }

        const checkedBoxes = await this.page.locator('input[type="checkbox"]:checked').count();
        return checkedBoxes;
    }

    async bulkDelete(): Promise<number> {
        const deleteBtn = this.page.locator('button').filter({ hasText: /Delete|Remove/ }).filter({ has: this.page.locator('svg') }).first();
        await expect(deleteBtn).toBeVisible({ timeout: 10000 });

        await deleteBtn.click();
        await this.page.waitForTimeout(300);

        const modal = this.page.locator('[role="dialog"]').first();

        try {
            await expect(modal).toBeVisible({ timeout: 10000 });

            const confirmBtn = modal.locator('button').filter({ hasText: /Delete|Confirm|Proceed/ }).first();
            if (await confirmBtn.isVisible({ timeout: 3000 })) {
                await confirmBtn.click();
            }

            await expect(modal.locator('text=/Deleted|Complete|Success/')).toBeVisible({ timeout: 30000 });

            const text = await modal.textContent();
            const match = text?.match(/(\d+)/);
            return match ? parseInt(match[1]) : 1;
        } catch {
            return 0;
        }
    }
}
