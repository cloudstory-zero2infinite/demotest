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

  const loginMode = process.env.LOGIN_MODE || 'email';

  if (loginMode === 'google') {
    await _googleLogin(page, dashboardHeading);
  } else {
    await _emailLogin(page, dashboardHeading);
  }

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

// ─── Manual Google OAuth login ──────────────────────────────────────────
// User manually enters Google credentials in popup, Playwright waits for OAuth to complete
async function _googleLogin(page: Page, dashboardHeading: Locator) {
  console.log('[auth] Starting Google OAuth login (manual entry)');

  // Click "Login with Google" button
  const googleLoginBtn = page.getByRole('button', { name: /google|sign.*google/i });
  await googleLoginBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('[auth] Clicking "Login with Google" button...');
  await googleLoginBtn.click();

  // Wait for Google OAuth popup to open
  console.log('[auth] Waiting for Google login popup... (you have 5 minutes to manually login)');
  const popupPromise = page.context().waitForEvent('page');
  const googlePage = await popupPromise;

  console.log('[auth] Google popup opened. Waiting for you to complete manual login...');

  // Wait for popup to close OR for main page to redirect back
  // Whichever happens first indicates login completion
  try {
    await googlePage.waitForLoadState('domcontentloaded', { timeout: 300000 }); // 5 min timeout

    // Wait for popup to close automatically after successful login
    await googlePage.isClosed().catch(() => {});

    // Give the popup a moment to close, then close it if still open
    await page.waitForTimeout(2000);
    if (!googlePage.isClosed()) {
      await googlePage.close().catch(() => {});
    }
  } catch {
    // Popup may have already closed, that's OK
  }

  // Wait for main page to complete OAuth redirect
  console.log('[auth] Waiting for OAuth redirect to complete...');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000); // Extra buffer for session to be set

  // Optional onboarding step
  try {
    const nameInput = page.locator('input[placeholder*="name"]');
    if (await nameInput.isVisible({ timeout: 5000 })) {
      console.log('[auth] Onboarding required - entering test user name...');
      await nameInput.fill('E2E Google Test User');
      await page.getByRole('button', { name: /Continue|Save/i }).click();
    }
  } catch { /* optional step */ }

  // Wait for dashboard to appear
  await expect(dashboardHeading).toBeVisible({ timeout: 30000 });
  console.log('[auth] Google OAuth login successful ✓');
}
