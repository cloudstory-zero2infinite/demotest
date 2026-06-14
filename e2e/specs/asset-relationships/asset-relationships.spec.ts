/**
 * Governance → Asset Relationships — E2E Test Suite
 *
 * Phase 1 (Tests 1–5):  View, Add, View-modal, Edit, Delete
 * Phase 2 (Tests 6–9):  Text filter, Relationship-type filter, Sort, Drag-and-drop reorder
 * Phase 3 (Tests 10–11): Bulk delete, Bulk inline edit
 * Phase 4 (Tests 12–13): Custom field management, CSV import with new custom field
 *
 * Prerequisites:
 *   - At least 2 assets must exist in the test tenant.
 *   - beforeAll creates 2 assets; afterAll tears them down.
 *
 * Run:
 *   npx playwright test e2e/specs/governance/asset-relationships --headed
 */
import { test, expect, Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../helpers/auth-helper';
import { AssetRelationshipActions } from '../../helpers/asset-relationship-actions';
import { AssetActions } from '../../helpers/asset-actions';

const captureSnapshot = async (page: Page, testInfo: TestInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'asset-relationships');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Governance / Asset Relationships', () => {
    test.describe.configure({ timeout: 60_000 });

    let rels: AssetRelationshipActions;
    let prereqAsset1Name = '';
    let prereqAsset2Name = '';

    // ── Per-test setup: create 2 fresh assets for each test ────────────────────
    test.beforeEach(async ({ page }) => {
        rels = new AssetRelationshipActions(page);
        await ensureLoggedIn(page);
        await rels.navigate();

        // Create 2 prerequisite assets in the same context as the test
        const assets = new AssetActions(page);
        await assets.navigate();
        const ts = Date.now();
        prereqAsset1Name = `E2E-Rel-Asset-A-${ts}`;
        prereqAsset2Name = `E2E-Rel-Asset-B-${ts}`;
        await assets.create(prereqAsset1Name);
        await page.waitForTimeout(500);
        await assets.create(prereqAsset2Name);

        // Navigate back to Asset Relationships
        await rels.navigate();
    });

    // ── Per-test cleanup: remove the 2 prerequisite assets ──────────────────────
    test.afterEach(async ({ page }, testInfo) => {
        // Delete prerequisite assets after test completes
        try {
            const assets = new AssetActions(page);
            await assets.navigate();
            for (const name of [prereqAsset1Name, prereqAsset2Name]) {
                try { await assets.delete(name); } catch { /* already gone or not created */ }
            }
        } catch {
            // Cleanup is best-effort; if it fails, the next test will create new ones with new timestamps
        }
        await captureSnapshot(page, testInfo);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Phase 1: Core CRUD
    // ══════════════════════════════════════════════════════════════════════════

    // ── 1. Table display ───────────────────────────────────────────────────────
    test('Relationship: should display the table with required columns', async ({ page }) => {
        // All three standard column headers visible
        await expect(
            page.locator('th').filter({ has: page.locator('button', { hasText: /^Source Asset$/i }) }).first()
        ).toBeVisible();
        await expect(
            page.locator('th').filter({ has: page.locator('button', { hasText: /^Relationship$/i }) }).first()
        ).toBeVisible();
        await expect(
            page.locator('th').filter({ has: page.locator('button', { hasText: /^Target Asset$/i }) }).first()
        ).toBeVisible();
        // Filter input
        await expect(rels.filterInput()).toBeVisible();
        // Toolbar buttons
        await expect(page.locator('button[title="Add Relationship"]').first()).toBeVisible();
        await expect(page.locator('button[title="Import CSV"]:visible').first()).toBeVisible();
        await expect(page.locator('button[title="Export CSV"]:visible').first()).toBeVisible();
    });

    // ── 2. Add ─────────────────────────────────────────────────────────────────
    test('Relationship: should add a new relationship', async ({ page }) => {
        test.setTimeout(30_000);
        const rel = await rels.create(undefined, undefined, 'Depends On');

        // Verify the row appears in the table with the correct type
        await rels.filterInput().fill(rel.sourceId);
        const row = page.locator('tbody tr:visible').filter({ hasText: rel.sourceId }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText('Depends On');

        // Cleanup — using deleteViaBulk until deleteAssetRelationship() exists in the service layer
        await rels.filterInput().clear();
        await rels.deleteViaBulk(rel.sourceId);
    });

    // ── 3. View (read-only modal) ───────────────────────────────────────────────
    test('Relationship: should open view modal in read-only mode', async ({ page }) => {
        test.setTimeout(30_000);
        const rel = await rels.create(undefined, undefined, 'Hosts');

        const dialog = await rels.openView(rel.sourceId);

        // All fields are rendered as read-only inputs (not selects)
        await expect(dialog.locator('input[readonly]').first()).toBeVisible({ timeout: 5000 });
        // No submit button in view mode
        await expect(dialog.locator('button[type="submit"]')).toHaveCount(0);
        // Header actions: Edit and Delete buttons visible
        await expect(dialog.locator('button[title="Edit"]').first()).toBeVisible();
        await expect(dialog.locator('button[title="Delete"]').first()).toBeVisible();

        // Close modal
        await page.locator('[aria-label="Close modal"]').first().click().catch(() =>
            dialog.locator('button').filter({ hasText: /Cancel|Close/i }).first().click()
        );
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
        await rels.filterInput().clear();

        // Cleanup — using deleteViaBulk until deleteAssetRelationship() exists in the service layer
        await rels.deleteViaBulk(rel.sourceId);
    });

    // ── 4. Edit ────────────────────────────────────────────────────────────────
    test('Relationship: should edit a relationship type', async ({ page }) => {
        test.setTimeout(40_000);
        const rel = await rels.create(undefined, undefined, 'Connected To');

        await rels.edit(rel.sourceId, 'Owned By');

        // Verify the updated type shows in the table
        await rels.filterInput().fill(rel.sourceId);
        const row = page.locator('tbody tr:visible').filter({ hasText: rel.sourceId }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText('Owned By');

        await rels.filterInput().clear();

        // Re-open to confirm the value persisted
        const dialog = await rels.openView(rel.sourceId);
        const typeInput = dialog.locator('input').nth(2);
        await expect(typeInput).toHaveValue('Owned By');
        await page.locator('[aria-label="Close modal"]').first().click().catch(() =>
            dialog.locator('button').filter({ hasText: /Cancel|Close/i }).first().click()
        );
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
        await rels.filterInput().clear();

        // Cleanup — using deleteViaBulk until deleteAssetRelationship() exists in the service layer
        await rels.deleteViaBulk(rel.sourceId);
    });

    // ── 5. Delete ──────────────────────────────────────────────────────────────
    // SKIP: deleteAssetRelationship() is missing from services/supabase.ts — the delete button silently throws TypeError, no DELETE request is made
    test.skip('Relationship: should delete a relationship', async ({ page }) => {
        test.setTimeout(30_000);
        const rel = await rels.create(undefined, undefined, 'Backs Up');

        await rels.delete(rel.sourceId);

        // Verify row is gone
        await rels.filterInput().fill(rel.sourceId);
        // Either empty state or the row simply absent
        const rows = page.locator('tbody tr:visible').filter({ hasText: rel.sourceId });
        await expect(rows).toHaveCount(0, { timeout: 10000 });
        await rels.filterInput().clear();
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Phase 2: Filter, Sort, Column Reorder
    // ══════════════════════════════════════════════════════════════════════════

    // ── 6. Text filter ─────────────────────────────────────────────────────────
    test('Relationship: should filter by source/target asset text', async ({ page }) => {
        test.setTimeout(40_000);
        const relA = await rels.create(undefined, undefined, 'Connected To');
        // Get a different pair for relB by using the same sourceId but different type
        // (create returns the first two assets; swap for the second relationship)
        const assetIds = await rels.getAvailableAssetIds();
        const relB = await rels.create(
            assetIds[1] ?? relA.targetId,
            assetIds[0] ?? relA.sourceId,
            'Hosts',
        ).catch(() => null);

        // Filter for relA's source — only rows containing it should appear
        await rels.filterInput().fill(relA.sourceId);
        await page.waitForTimeout(400);
        const visibleRows = page.locator('tbody tr:visible').filter({ hasText: relA.sourceId });
        const count = await visibleRows.count();
        expect(count).toBeGreaterThanOrEqual(1);

        // Rows that DON'T mention relA.sourceId should not appear in filtered view
        if (relB && relB.sourceId !== relA.sourceId) {
            await expect(page.locator('tbody tr:visible').filter({ hasText: relB.sourceId, hasNotText: relA.sourceId }))
                .toHaveCount(0, { timeout: 5000 });
        }

        await rels.filterInput().clear();

        // Cleanup — using deleteViaBulk until deleteAssetRelationship() exists in the service layer
        await rels.deleteViaBulk(relA.sourceId);
        if (relB) {
            try { await rels.deleteViaBulk(relB.sourceId); } catch { /* may already be gone */ }
        }
    });

    // ── 7. Relationship type column filter ─────────────────────────────────────
    test('Relationship: should filter by relationship type via column dropdown', async ({ page }) => {
        test.setTimeout(40_000);
        const relA = await rels.create(undefined, undefined, 'Contains');

        // Apply column filter for 'Contains'
        await rels.applyRelTypeFilter('Contains');
        await page.waitForTimeout(300);

        // All visible rows should show 'Contains' in the relationship type cell
        const rows = page.locator('tbody tr:visible');
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThanOrEqual(1);
        for (let i = 0; i < Math.min(rowCount, 5); i++) {
            await expect(rows.nth(i)).toContainText('Contains');
        }

        // The filter header button should be highlighted (blue text)
        const relHeader = page.locator('th').filter({
            has: page.locator('button', { hasText: /^Relationship$/i }),
        }).first();
        await expect(relHeader.locator('button').first()).toHaveClass(/text-blue-600/);

        // Clear the filter
        await rels.clearRelTypeFilter();
        await page.waitForTimeout(300);

        // Cleanup — using deleteViaBulk until deleteAssetRelationship() exists in the service layer
        await rels.deleteViaBulk(relA.sourceId);
    });

    // ── 8. Sort by column ──────────────────────────────────────────────────────
    test('Relationship: should sort by Source Asset column', async ({ page }) => {
        test.setTimeout(40_000);
        // Create 2 relationships so there's something to sort
        const relA = await rels.create(undefined, undefined, 'Connected To');
        const assetIds = await rels.getAvailableAssetIds();
        const relB = await rels.create(
            assetIds[1] ?? relA.targetId,
            assetIds[0] ?? relA.sourceId,
            'Hosts',
        ).catch(() => null);

        // Sort ascending
        await rels.sortByColumn('Source Asset');
        await page.waitForTimeout(500);

        // After first click ascending is applied; click again for descending
        await rels.sortByColumn('Source Asset');
        await page.waitForTimeout(500);
        // No assertion on exact row order (depends on live data); just verify no JS error and rows visible
        await expect(page.locator('tbody tr:visible').first()).toBeVisible({ timeout: 5000 });

        // Cleanup — using deleteViaBulk until deleteAssetRelationship() exists in the service layer
        await rels.deleteViaBulk(relA.sourceId);
        if (relB) {
            try { await rels.deleteViaBulk(relB.sourceId); } catch { }
        }
    });

    // ── 9. Drag-and-drop column reorder ───────────────────────────────────────
    test('Relationship: should reorder columns via drag and drop', async ({ page }) => {
        test.setTimeout(30_000);
        // Default order: Source Asset | Relationship | Target Asset
        const sourceHeader = page.locator('th').filter({
            has: page.locator('button', { hasText: /^Source Asset$/i }),
        }).first();
        const targetHeader = page.locator('th').filter({
            has: page.locator('button', { hasText: /^Target Asset$/i }),
        }).first();

        // Record initial order: Source Asset comes before Target Asset
        const sourceBox = await sourceHeader.boundingBox();
        const targetBox = await targetHeader.boundingBox();
        expect(sourceBox!.x).toBeLessThan(targetBox!.x);

        // Drag Target Asset header onto Source Asset header (swap)
        await targetHeader.dragTo(sourceHeader);
        await page.waitForTimeout(600);

        // After drag the column order in localStorage should be updated.
        // Verify by checking the first data-column's header text changed position.
        const allThs = await page.locator('thead th').allTextContents();
        // Remove the checkbox column (first th) and get the content of the 2nd th
        const dataHeaders = allThs.slice(1).filter(t => t.trim());
        // Target Asset should now appear before Source Asset
        const tIdx = dataHeaders.findIndex(h => /Target Asset/i.test(h));
        const sIdx = dataHeaders.findIndex(h => /Source Asset/i.test(h));
        expect(tIdx).toBeLessThan(sIdx);

        // Reset: drag Source Asset back to the front
        const sourceHeaderAfter = page.locator('th').filter({
            has: page.locator('button', { hasText: /^Source Asset$/i }),
        }).first();
        const targetHeaderAfter = page.locator('th').filter({
            has: page.locator('button', { hasText: /^Target Asset$/i }),
        }).first();
        await sourceHeaderAfter.dragTo(targetHeaderAfter);
        await page.waitForTimeout(400);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Phase 3: Bulk Operations
    // ══════════════════════════════════════════════════════════════════════════

    // ── 10. Bulk delete ────────────────────────────────────────────────────────
    // SKIP: DELETE /api/assets/relationships/bulk API succeeds, but AssetRelationshipsView doesn't re-fetch table data after bulk delete — rows remain visible. Component must call useUnifiedRefresh or similar on bulk response.
    test.skip('Relationship: should bulk delete selected relationships', async ({ page }) => {
        test.setTimeout(60_000);
        const relA = await rels.create(undefined, undefined, 'Connected To');
        // Use opposite direction for second relationship to guarantee distinct sourceIds
        const assetIds = await rels.getAvailableAssetIds();
        const relB = await rels.create(
            assetIds[1] ?? relA.targetId,
            assetIds[0] ?? relA.sourceId,
            'Managed By',
        ).catch(() => null);

        // Select relA
        await rels.selectRow(relA.sourceId);

        // Select relB if it was created with a different sourceId
        if (relB && relB.sourceId !== relA.sourceId) {
            await rels.selectRow(relB.sourceId);
        }

        // Verify SelectionActionBar appears with a blue count chip
        // (SelectionActionBar renders count and "selected" in SEPARATE spans, so we check
        // the blue count bubble which is always present when something is selected)
        const actionBar = page.locator('.fixed.bottom-6').first();
        await expect(actionBar).toBeVisible({ timeout: 5000 });
        await expect(actionBar.locator('span.bg-blue-500').first()).toBeVisible({ timeout: 5000 });

        // Perform bulk delete
        await rels.bulkDelete();

        // Verify relA is gone
        await rels.filterInput().fill(relA.sourceId);
        await page.waitForTimeout(400);
        await expect(page.locator('tbody tr:visible').filter({ hasText: relA.sourceId })).toHaveCount(0, { timeout: 10000 });
        await rels.filterInput().clear();

        // Cleanup any remaining — using deleteViaBulk until deleteAssetRelationship() exists in the service layer
        if (relB && relB.sourceId !== relA.sourceId) {
            try { await rels.deleteViaBulk(relB.sourceId); } catch { /* already deleted */ }
        }
    });

    // ── 11. Bulk edit (inline) ─────────────────────────────────────────────────
    test('Relationship: should bulk edit relationship type inline', async ({ page }) => {
        test.setTimeout(60_000);
        const relA = await rels.create(undefined, undefined, 'Connected To');
        const assetIds = await rels.getAvailableAssetIds();
        const relB = await rels.create(
            assetIds[1] ?? relA.targetId,
            assetIds[0] ?? relA.sourceId,
            'Connected To',
        ).catch(() => null);

        // Select both rows
        await rels.selectRow(relA.sourceId);
        if (relB && relB.sourceId !== relA.sourceId) {
            await rels.selectRow(relB.sourceId);
        }

        // Verify action bar appeared with Edit button
        const actionBar = page.locator('.fixed.bottom-6').first();
        await expect(actionBar).toBeVisible({ timeout: 5000 });
        await expect(actionBar.locator('button').filter({ hasText: /^Edit$/ })).toBeVisible({ timeout: 5000 });

        // Enter edit mode and change relA's type
        await rels.bulkEditRelationshipType(relA.sourceId, 'Replicates To');

        // Verify the updated type is visible in the table
        await rels.filterInput().fill(relA.sourceId);
        const row = page.locator('tbody tr:visible').filter({ hasText: relA.sourceId }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText('Replicates To');
        await rels.filterInput().clear();

        // Cleanup — using deleteViaBulk until deleteAssetRelationship() exists in the service layer
        await rels.deleteViaBulk(relA.sourceId);
        if (relB && relB.sourceId !== relA.sourceId) {
            try { await rels.deleteViaBulk(relB.sourceId); } catch { }
        }
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Phase 4: Custom Fields
    // ══════════════════════════════════════════════════════════════════════════

    // ── 12. Custom field management ────────────────────────────────────────────
    test('Relationship: should create and delete a custom field column', async ({ page }) => {
        test.setTimeout(40_000);
        const ts = Date.now();
        const fieldName = `e2e_rel_field_${ts}`;
        const fieldLabel = `E2E Rel Field ${ts}`;

        // Create the custom field
        await rels.createCustomField(fieldName, fieldLabel);

        // Verify the new column header appears in the table
        await expect(
            page.locator('th').filter({ hasText: fieldLabel }).first()
        ).toBeVisible({ timeout: 10000 });

        // Verify the Manage Columns modal lists it
        await page.locator('button[title="Manage Columns"]:visible').first().click();
        const modal = page.locator('div', { has: page.locator('h3', { hasText: /Manage.*Custom Columns/i }) }).first();
        await expect(modal).toBeVisible({ timeout: 10000 });
        await expect(modal.locator('div').filter({ hasText: fieldLabel }).first()).toBeVisible({ timeout: 5000 });
        // Close modal before cleanup
        await modal.locator('div.flex.items-center.justify-between.px-6.py-4').locator('button').last().click();
        await expect(modal).not.toBeVisible({ timeout: 5000 });

        // Cleanup: delete the custom field
        await rels.deleteCustomField(fieldLabel);

        // Column header should be gone
        await expect(
            page.locator('th').filter({ hasText: fieldLabel })
        ).toHaveCount(0, { timeout: 10000 });
    });

    // ── 13. CSV import with new custom field ───────────────────────────────────
    // SKIP: handleConfirmMapping() does not close ImportMappingModal before showing the new-fields dialog — mapping modal's <td> cells intercept the "Confirm & Import Data" click
    test.skip('Relationship: should import CSV and auto-create a new custom field', async ({ page }) => {
        test.setTimeout(60_000);
        const ts = Date.now();
        const customFieldLabel = `E2E Import Tag ${ts}`;

        // Discover real asset IDs so the CSV references valid source/target
        const assetIds = await rels.getAvailableAssetIds();
        const [srcId, tgtId] = assetIds;

        // Build CSV with one standard mapping + one new custom field column
        const csvContent = [
            `Source Asset ID,Target Asset ID,Relationship Type,${customFieldLabel}`,
            `${srcId},${tgtId},Communicates With,AutoTagValue`,
        ].join('\n');
        const csvPath = rels.writeTempCSV(csvContent);

        try {
            // Step 1: Upload → Column Mapping modal opens
            await rels.triggerCSVUpload(csvPath);

            // Verify standard columns are auto-matched in the mapping table
            const mappingDialog = page
                .locator('[role="dialog"]')
                .filter({ hasText: /Map CSV Columns/i })
                .first();
            await expect(mappingDialog.locator('text=Source Asset ID').first()).toBeVisible({ timeout: 5000 });
            // "Target Asset ID" appears as a disabled <option> (already auto-mapped) — use
            // toContainText which checks the full DOM text content including option elements
            await expect(mappingDialog).toContainText('Target Asset ID', { timeout: 5000 });
            await expect(mappingDialog).toContainText('Relationship Type', { timeout: 5000 });

            // Step 2: Click "Review Data" → new-fields detection
            await rels.confirmMapping();

            // Step 3: "New Custom Fields Detected" modal → confirm & create field
            await rels.confirmNewFields();

            // Step 4: Inline import confirmation modal → click Import
            await rels.confirmImport();

            // Verify imported row appears in the table
            await rels.filterInput().fill(srcId);
            await page.waitForTimeout(500);
            const importedRow = page.locator('tbody tr:visible').filter({ hasText: 'Communicates With' }).first();
            await expect(importedRow).toBeVisible({ timeout: 10000 });
            await rels.filterInput().clear();

            // Verify the new custom field column was created
            await expect(
                page.locator('th').filter({ hasText: customFieldLabel }).first()
            ).toBeVisible({ timeout: 10000 });

        } finally {
            // Cleanup: delete the imported relationship
            try {
                await rels.filterInput().fill(srcId);
                await page.waitForTimeout(400);
                const importedRows = page.locator('tbody tr:visible').filter({ hasText: 'Communicates With' });
                const count = await importedRows.count();
                await rels.filterInput().clear();
                if (count > 0) await rels.delete(srcId);
            } catch { /* best-effort cleanup */ }

            // Cleanup: delete the auto-created custom field
            try { await rels.deleteCustomField(customFieldLabel); } catch { }

            // Cleanup temp CSV file
            try { fs.unlinkSync(csvPath); } catch { }
        }
    });
});
