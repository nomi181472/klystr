import { expect, test, type Page } from '@playwright/test';

const phase = process.env.UI_AUDIT_PHASE === 'after' ? 'after' : 'before';
test.skip(!process.env.UI_AUDIT_PHASE, 'Set UI_AUDIT_PHASE=before or after for an explicit audit capture.');
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `artifacts/ui-audit/${phase}/${name}.png`, fullPage: true });
}

async function openWorkspace(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
}

for (const viewport of viewports) {
  test(`capture ${phase} UI at ${viewport.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'light');
      localStorage.removeItem('kubelinks-connection');
    });
    await page.goto('/?ns=database%2Capi&nsMode=selected');
    await expect(page.getByRole('heading', { name: 'KubeGraph' })).toBeVisible();
    await expect(page.locator('.react-flow').getByText('database').first()).toBeVisible({ timeout: 10000 });
    await capture(page, `${viewport.name}-topology`);

    await openWorkspace(page, 'RBAC');
    await expect(page.getByText('Access management')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit permissions' }).first()).toBeVisible({ timeout: 10000 });
    await capture(page, `${viewport.name}-rbac`);

    await openWorkspace(page, 'Image Analysis');
    await expect(page.getByText('Image Analysis', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Reference', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await capture(page, `${viewport.name}-image-analysis`);

    await openWorkspace(page, 'Manifests');
    await expect(page.getByText('No manifest dataset loaded')).toBeVisible();
    await capture(page, `${viewport.name}-manifests-empty`);

    await openWorkspace(page, 'Security');
    await expect(page.getByText('Control coverage')).toBeVisible({ timeout: 10000 });
    await capture(page, `${viewport.name}-security`);

    expect(errors).toEqual([]);
  });
}

test(`capture ${phase} overlays and interactions`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('/?ns=database%2Capi&nsMode=selected');
  await page.getByLabel('Change application data source').click();
  await expect(page.getByRole('option', { name: /Live cluster/ })).toBeVisible();
  await capture(page, 'desktop-source-dropdown');
  await page.keyboard.press('Escape');
  await page.getByLabel('Connection settings').click();
  await expect(page.getByRole('dialog', { name: 'Connection settings' })).toBeVisible();
  await capture(page, 'desktop-settings-dialog');
});
