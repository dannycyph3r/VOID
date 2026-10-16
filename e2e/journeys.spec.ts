// User journeys against the production build served by server/index.ts.
// Flights run in real time: the stage 01 reference flight takes 22.7 s.
import { expect, test, type Page } from '@playwright/test';
import { ONLINE_PORTS } from './ports.ts';

/** Home → Stages → select stage 01 → LAUNCH. */
async function openFlight01(page: Page, base = '') {
  await page.goto(`${base}/`);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Stages/ }).click();
  await expect(page).toHaveURL(/#\/stages/);
  await page.getByRole('button', { name: /^Stage 01 First Light/ }).click();
  await page.getByRole('link', { name: /LAUNCH/ }).click();
  await expect(page).toHaveURL(/#\/flight\/01$/);
  await expect(page.getByRole('heading', { name: 'First Light' })).toBeVisible();
}

/** Aim with the keyboard only (arrows step 0.5° / 2 %, Shift steps 0.1° / 1 %). */
async function aim(page: Page, tenths: number, power: number) {
  await expect(page.locator('[data-engine-canvas="playfield"]')).toBeFocused();
  const angleOut = page.getByLabel('Launch angle');
  const powerOut = page.getByLabel('Launch power');
  const press = async (key: string, n: number) => { for (let i = 0; i < n; i++) await page.keyboard.press(key); };

  let da = tenths - Math.round(parseFloat(await angleOut.innerText()) * 10);
  const coarseA = Math.trunc(da / 5);
  await press(coarseA < 0 ? 'ArrowLeft' : 'ArrowRight', Math.abs(coarseA));
  da -= coarseA * 5;
  await press(da < 0 ? 'Shift+ArrowLeft' : 'Shift+ArrowRight', Math.abs(da));

  let dp = power - parseInt(await powerOut.innerText(), 10);
  const coarseP = Math.trunc(dp / 2);
  await press(coarseP < 0 ? 'ArrowDown' : 'ArrowUp', Math.abs(coarseP));
  dp -= coarseP * 2;
  await press(dp < 0 ? 'Shift+ArrowDown' : 'Shift+ArrowUp', Math.abs(dp));

  await expect(angleOut).toHaveText(`${(tenths / 10).toFixed(1)}°`);
  await expect(powerOut).toHaveText(`${power}%`);
}

async function launchAndWaitForResult(page: Page) {
  await page.keyboard.press('Space');
  // The aim controls leave once the probe is in flight.
  await expect(page.getByLabel('Launch angle')).toBeHidden({ timeout: 5_000 });
  await expect(page).toHaveURL(/#\/result$/, { timeout: 60_000 });
}

/** Fly stage 01's reference solution (2.0°, 74 %) and land on Result, score 227. */
async function completeFlight01(page: Page, base = '') {
  await openFlight01(page, base);
  await aim(page, 20, 74);
  await launchAndWaitForResult(page);
  await expect(page.getByText(/COMPLETE · /)).toBeVisible();
  await expect(page.getByLabel('Score 227')).toHaveText('227');
}

async function openStats(page: Page, base = '') {
  await page.goto(`${base}/`);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Stats/ }).click();
  await expect(page).toHaveURL(/#\/stats/);
}

test.describe('local-only build', () => {
  test('complete Flight 01 by keyboard, then Stats lists it on this device only', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api')) apiCalls.push(r.url()); });

    await completeFlight01(page);

    await openStats(page);
    await expect(page.getByText('LOCAL ONLY · THIS DEVICE')).toBeVisible();
    await expect(page.getByText('Online rankings are not configured for this build.')).toBeVisible();
    const row = page.getByRole('table', { name: 'Your runs on this device' }).getByRole('row').nth(1);
    await expect(row).toContainText('01');
    await expect(row).toContainText('227');
    expect(apiCalls, 'a local-only build must not call the API').toEqual([]);
  });

  test('failed run, then Retry with R', async ({ page }) => {
    await openFlight01(page);
    // 40.0° at 60 % hits the planet after about 12 s.
    await aim(page, 400, 60);
    await launchAndWaitForResult(page);
    await expect(page.getByText('FAILED · IMPACT')).toBeVisible();
    await expect(page.getByLabel('No score')).toHaveText('—');

    await page.keyboard.press('r');
    await expect(page).toHaveURL(/#\/flight\/01$/);
    await expect(page.getByRole('heading', { name: 'First Light' })).toBeVisible();
    // Back on the pad with the stage's starting aim.
    await expect(page.getByLabel('Launch angle')).toHaveText('45.0°');
    await expect(page.getByLabel('Launch power')).toHaveText('60%');
  });
});

test.describe('online build', () => {
  test('submit with a callsign → verified, rank 1', async ({ page, browserName }) => {
    const base = `http://localhost:${ONLINE_PORTS[browserName]}`;
    await completeFlight01(page, base);

    await openStats(page, base);
    await expect(page.getByText(/LIVE · VERIFIED RUNS/)).toBeVisible();
    const callsign = `E2E-${browserName.slice(0, 6).toUpperCase()}`;
    await page.getByLabel(/^Callsign/).fill(callsign);
    await page.getByRole('button', { name: 'SUBMIT' }).click();
    await expect(page.getByText('✓ VERIFIED · RANK 1')).toBeVisible();

    // The server stored the run it re-simulated: it is on the board after a reload.
    await page.reload();
    const board = page.getByRole('table');
    await expect(board.getByRole('row', { name: new RegExp(callsign) }).first()).toContainText('227');
    await expect(page.getByText(/1 PILOT\b/)).toBeVisible();
  });
});
