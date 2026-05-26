/**
 * Governance → Policy tab — CRUD E2E tests
 *
 * Login strategy: `ensureLoggedIn` is called once in beforeEach.
 * It checks if the session is already active (via storageState in playwright.config.ts)
 * and skips the login form if the dashboard is already visible.
 * This means only the very first test in the run actually logs in;
 * subsequent tests reuse the saved session.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ensureLoggedIn } from '../../../helpers/auth-helper';
import { PolicyActions } from '../../../helpers/policy-actions';

const captureSnapshot = async (page, testInfo) => {
    const status = testInfo.status === 'passed' ? 'Success' : 'Fail';
    const dir = path.join(process.cwd(), 'e2e/screenshots', status, 'policies');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
        await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: false });
    } catch { /* non-fatal */ }
};

test.describe('Governance / Policies', () => {
    test.describe.configure({ timeout: 30_000 });
    let policies: PolicyActions;

    test.beforeEach(async ({ page }) => {
        policies = new PolicyActions(page);
        await ensureLoggedIn(page);
        await policies.navigate();
    });

    test.afterEach(async ({ page }, testInfo) => {
        await captureSnapshot(page, testInfo);
    });

    test('Policy: should create a new draft policy', async ({ page }) => {
        test.setTimeout(20_000);
        const title = `E2E-Policy-Create-${Date.now()}`;
        await policies.create(title);
    });

    test('Policy: should update an existing policy', async ({ page }) => {
        test.setTimeout(25_000);
        const title = `E2E-Policy-Update-${Date.now()}`;
        await policies.create(title);
        await policies.update(title, `${title}-Edited`);
    });

    test('Policy: should delete a policy', async ({ page }) => {
        test.setTimeout(25_000);
        const title = `E2E-Policy-Delete-${Date.now()}`;
        await policies.create(title);
        await policies.delete(title);
    });
});
