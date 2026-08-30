import { expect, test } from '@playwright/test';

test('runtime registry exposes core and future plugins', async ({ request }) => {
  const response = await request.get('/api/plugins');
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { plugins: Array<{ id: string }> };
  expect(body.plugins.map((plugin) => plugin.id)).toEqual(expect.arrayContaining([
    'topology', 'rbac', 'images', 'manifests', 'security', 'ideas',
  ]));
});

test('registered but undeployed plugin shows unavailable state', async ({ page }) => {
  await page.goto('/plugins/ideas');
  await expect(page.getByRole('heading', { name: 'This page is not available' })).toBeVisible();
});
