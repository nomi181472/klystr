import { expect, test, type Page } from '@playwright/test';

async function loadMock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'light');
    localStorage.removeItem('kubelinks-connection');
  });
  await page.goto('/?ns=database%2Capi&nsMode=selected');
  await expect(page.getByRole('heading', { name: 'KubeGraph' })).toBeVisible();
}

test('manifest empty state remains visually consistent', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadMock(page);
  await page.getByRole('button', { name: 'Manifests' }).click();
  await expect(page.getByText('No manifest dataset loaded')).toBeVisible();
  await expect(page).toHaveScreenshot('manifest-empty-light.png', {
    animations: 'disabled',
    mask: [page.locator('[title^="Last updated"]')],
  });
});

test('security posture remains visually consistent on tablet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await loadMock(page);
  await page.getByRole('button', { name: 'Security' }).click();
  await expect(page.getByText('Control coverage')).toBeVisible();
  await expect(page).toHaveScreenshot('security-posture-tablet-light.png', {
    animations: 'disabled',
    mask: [page.locator('[title^="Last updated"]')],
  });
});
