// Browser E2E: cross-engine determinism and user journeys in Chromium,
// Firefox and WebKit. `npm run e2e`; see e2e/servers.ts for what runs.
import { defineConfig, devices } from '@playwright/test';
import { LOCAL_PORT } from './e2e/ports.ts';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.out/results',
  // Flights run in real time (stage 01's reference run is 22.7 s).
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${LOCAL_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node e2e/servers.ts',
    url: `http://localhost:${LOCAL_PORT}/`,
    // A reused server would carry an old leaderboard database.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
  },
});
