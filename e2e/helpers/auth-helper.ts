import { expect, type Locator, type Page } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const AUTH_FILE = 'e2e/fixtures/user.json';

export async function ensureLoggedIn(page: Page) {
  await page.goto('/');
  // `networkidle` is brittle for SPAs with background polling and can hang tests.
  await page.waitForLoadState('domcontentloaded');

  const dashboardHeading: Locator = page.getByRole('heading', { name: /Security Score/i });

  // ── Quick check: already logged in? ──────────────────────────────────────
  try {
    await dashboardHeading.waitFor({ state: 'visible', timeout: 15000 });
    console.log('[auth] Already logged in — skipping login step.');
    return;
  } catch {
    // Not logged in yet, proceed below
  }

  await _emailLogin(page, dashboardHeading);

  // Save session so subsequent tests skip login entirely
  await page.context().storageState({ path: AUTH_FILE });
  console.log('[auth] Session saved to', AUTH_FILE);
}

// ─── Automated email/password login ──────────────────────────────────────────
async function _emailLogin(page: Page, dashboardHeading: Locator) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error('Missing E2E_EMAIL/E2E_PASSWORD env vars for Playwright login.');
  }

  console.log(`[auth] Starting email login for: ${email}`);

  const loginWithEmailBtn = page.getByRole('button', { name: 'Login with Email', exact: true });

  try {
    await loginWithEmailBtn.waitFor({ state: 'visible', timeout: 5000 });
    await loginWithEmailBtn.click();
  } catch {
    console.log('[auth] "Login with Email" button not found — form may already be open.');
  }

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submitBtn = page.locator('form').getByRole('button', { name: /^Sign In$|^Login$/i });
  await submitBtn.click();

  // Optional onboarding step
  try {
    const nameInput = page.locator('input[placeholder*="name"]');
    if (await nameInput.isVisible({ timeout: 5000 })) {
      await nameInput.fill('E2E Test User');
      await page.getByRole('button', { name: /Continue|Save/i }).click();
    }
  } catch { /* optional step */ }

  await expect(dashboardHeading).toBeVisible({ timeout: 30000 });
  console.log('[auth] Email login successful.');
}
