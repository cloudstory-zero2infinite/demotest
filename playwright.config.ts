import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// When BASE_URL is set (e.g. for pre-prod runs), skip the local dev server.
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';
const isRemote = !!process.env.BASE_URL;

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [['html', { open: 'never' }]],
  timeout: isRemote ? 60000 : 10000,

  use: {
    baseURL: BASE_URL,
    screenshot: 'off',
    video: 'off',
    trace: 'off',
    headless: !!process.env.CI,
    // Remote runs get longer timeouts to absorb Cloud Run cold starts
    actionTimeout: isRemote ? 30000 : 10000,
    navigationTimeout: isRemote ? 30000 : 10000,
    // Use a large viewport so the app renders in a full-size layout.
    // (Playwright does not allow `viewport: null` when device emulation sets `deviceScaleFactor`.)
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      args: ['--start-maximized', '--window-size=1920,1080'],
    },
    /* Reuse saved session if it exists; ensureLoggedIn() will populate it on first run */
    storageState: fs.existsSync('e2e/fixtures/user.json') ? 'e2e/fixtures/user.json' : undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        // Avoid `devices['Desktop Chrome']` here because it sets `deviceScaleFactor`,
        // which is incompatible with `viewport: null` and can cause context creation errors.
      },
    },
  ],

  // Only spin up a local dev server when not targeting a remote URL.
  ...(isRemote
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:5174',
          reuseExistingServer: true,
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 120000,
        },
      }),
});
