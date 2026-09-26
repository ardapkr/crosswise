import { test, expect } from '@playwright/test';

test('start button reveals controls and speaks a greeting', async ({ page }) => {
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Start' });
  await expect(start).toBeVisible();
  await start.click();
  await expect(start).toBeHidden();
  await expect(page.locator('#status')).toContainText('Crosswise ready');
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken.join(' ')).toContain('Crosswise ready');
});

test('mode switch is persisted across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Wheelchair' }).click();
  await expect(page.getByRole('button', { name: 'Wheelchair' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#status')).toContainText('Wheelchair mode');

  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Wheelchair' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Blind / low vision' })).toHaveAttribute('aria-pressed', 'false');
});

test('big buttons are at least 64px tall', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  for (const b of await page.locator('#modes button').all()) {
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(64);
  }
});
