import { expect, test, type Page } from '@playwright/test';

function monitor(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
  return { consoleErrors, pageErrors, failedResponses };
}

async function openApp(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(value => {
    if (!sessionStorage.getItem('theme-test-initialized')) {
      localStorage.setItem('theme', value);
      sessionStorage.setItem('theme-test-initialized', 'true');
    }
  }, theme);
  await page.goto('/?ns=database%2Capi&nsMode=selected');
  await expect(page.getByRole('heading', { name: 'KubeGraph' })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`));
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} theme covers topology, overlays, manifests and security`, async ({ page }) => {
    const errors = monitor(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, theme);

    const expectedToggle = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    await expect(page.getByRole('button', { name: expectedToggle })).toBeVisible();
    await page.getByLabel('Change application data source').click();
    await expect(page.getByRole('option', { name: /Live cluster/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByLabel('Connection settings').click();
    await expect(page.getByRole('dialog', { name: 'Connection settings' })).toBeVisible();
    await page.screenshot({ path: `test-results/${theme}-desktop-settings.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('link', { name: 'Manifests' }).click();
    await expect(page.getByText('No manifest dataset loaded')).toBeVisible();
    await page.getByRole('link', { name: 'Security' }).click();
    await page.getByRole('tab', { name: 'Network exposure' }).click();
    await expect(page.getByRole('columnheader', { name: 'Entrypoint' })).toBeVisible();
    await page.screenshot({ path: `test-results/${theme}-desktop-security.png`, fullPage: true });
    await expectNoOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
    await page.screenshot({ path: `test-results/${theme}-mobile-security.png`, fullPage: true });
    await expectNoOverflow(page);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.failedResponses).toEqual([]);
  });
}

test('theme toggle persists across reload and remains usable on mobile', async ({ page }) => {
  const errors = monitor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveClass(/(^|\s)light(\s|$)/);
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/(^|\s)light(\s|$)/);
  await page.getByRole('link', { name: 'Security' }).scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'Security' }).click();
  await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
  await page.screenshot({ path: 'test-results/light-mobile-security.png', fullPage: true });
  await expectNoOverflow(page);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.failedResponses).toEqual([]);
});
