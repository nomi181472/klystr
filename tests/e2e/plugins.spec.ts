import { expect, test } from '@playwright/test';

test('runtime registry exposes core and future plugins', async ({ request }) => {
  const response = await request.get('/api/plugins');
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { plugins: Array<{ id: string }> };
  expect(body.plugins.map((plugin) => plugin.id)).toEqual(expect.arrayContaining([
    'topology', 'rbac', 'images', 'manifests', 'security', 'telemetry', 'new_plugins',
  ]));
});

test('telemetry is immediately before New Plugins in workspace navigation', async ({ page }) => {
  await page.goto('/topology');
  const labels = await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('link').allTextContents();
  expect(labels.indexOf('Telemetry')).toBe(labels.indexOf('New Plugins') - 1);
  await page.getByRole('link', { name: 'Telemetry' }).click();
  await expect(page.getByText('Telemetry coming soon')).toBeVisible();
});

test('undeployed registered plugin uses the standard unavailable state', async ({ page }) => {
  await page.goto('/plugins/new_plugins');
  await expect(page.getByRole('heading', { name: 'This page is not available' })).toBeVisible();
});
