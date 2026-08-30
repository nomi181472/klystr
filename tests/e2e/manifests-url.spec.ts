import { expect, test } from '@playwright/test';

test.describe('manifest URL import', () => {
  test('shows the HTTPS YAML URL importer', async ({ page }) => {
    await page.goto('/manifests');
    await expect(page.getByLabel('Manifest YAML URL')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import URL' })).toBeDisabled();
    await page.getByLabel('Manifest YAML URL').fill('https://cdn.example.com/app.yaml');
    await expect(page.getByRole('button', { name: 'Import URL' })).toBeEnabled();
  });

  test('rejects URLs that could access a private network', async ({ request }) => {
    const response = await request.post('/api/manifest-graph/ingest', {
      data: { url: 'https://127.0.0.1/private.yaml' },
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Private, local, and link-local manifest URLs are not allowed.',
    });
  });
});
