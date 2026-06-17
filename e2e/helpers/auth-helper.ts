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
  // After a Sign Out, React briefly renders the dashboard from cached state,
  // making Security Score flash into the DOM before Supabase confirms the session
  // is revoked. We wait a moment after seeing it to verify no onboarding modal
  // follows — if one does, the session was stale and we fall through to re-login.
  try {
    await dashboardHeading.waitFor({ state: 'visible', timeout: 15000 });

    const onboardingModal = page.locator('div.fixed.inset-0').filter({
      has: page.locator('h1:has-text("Welcome to Zero to Infinite")')
    });
    const sessionStale = await onboardingModal.isVisible({ timeout: 5000 }).catch(() => false);

    if (!sessionStale) {
      console.log('[auth] Already logged in — skipping login step.');
      return;
    }

    console.log('[auth] Stale session detected — wiping all browser storage...');
    // Clear both localStorage and cookies so Supabase starts with no session.
    // localStorage.clear() alone is not enough — cookies can carry auth state too.
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Wait for the login form to render before _emailLogin tries to interact with it.
    await page.getByRole('button', { name: /Login with Email|Sign in with Email/i })
      .waitFor({ state: 'visible', timeout: 15000 });
    console.log('[auth] Session wiped — login form ready.');
  } catch {
    // Security Score not found — not logged in yet, proceed below
  }

  const loginMode = process.env.LOGIN_MODE || 'email';

  if (loginMode === 'google') {
    await _googleLogin(page, dashboardHeading);
  } else {
    await _emailLogin(page, dashboardHeading);
  }

  // Dismiss any onboarding overlay that appears after fresh login
  await _dismissOnboardingOverlay(page);

  // Save session so subsequent tests skip login entirely
  await page.context().storageState({ path: AUTH_FILE });
  console.log('[auth] Session saved to', AUTH_FILE);
}

// ─── Dismiss the "Welcome to Zero to Infinite" onboarding overlay ─────────────
// This modal requires explicit user action and never auto-dismisses.
// When detected, reload the page — the test account has an org, so a fresh
// load resolves the session correctly and shows the dashboard without the modal.
async function _dismissOnboardingOverlay(page: Page) {
  try {
    const overlay = page.locator('div.fixed.inset-0').filter({
      has: page.locator('h1:has-text("Welcome to Zero to Infinite")')
    });
    if (!(await overlay.isVisible({ timeout: 3000 }))) return;

    // Overlay appeared after a fresh login — should not happen for an onboarded user.
    // A hard reload re-establishes the session correctly.
    console.log('[auth] Onboarding overlay appeared after login — reloading...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Security Score/i }).waitFor({ state: 'visible', timeout: 20000 });
    console.log('[auth] Reload cleared the overlay.');
  } catch {
    // No overlay — nothing to do
  }
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
