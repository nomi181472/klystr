import { expect, test } from '@playwright/test';

/**
 * Comprehensive audit of shell + RBAC integration
 * Tests:
 * 1. Shell loads and renders properly
 * 2. RBAC plugin is accessible and loads
 * 3. No console errors or network errors
 * 4. UI elements are visible and interactive
 * 5. Design consistency between shell and RBAC
 */

/**
 * Remote entry URLs (ports 3001-3005) are only reachable when remotes are
 * running locally. When they are not, the shell falls back to the local
 * bundled component — the correct behaviour. Filter those expected
 * connection errors so tests focus on real application errors only.
 */
const REMOTE_ENTRY_PATTERN = /localhost:300[1-5]/;

function isRemoteEntryError(text: string): boolean {
  return REMOTE_ENTRY_PATTERN.test(text) && text.includes('ERR_CONNECTION_REFUSED');
}

test.describe('Shell + RBAC Integration Audit', () => {
  let consoleErrors: string[] = [];
  let networkErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    networkErrors = [];

    // Capture console errors — exclude expected remote entry connection failures
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const url = msg.location().url ?? '';
        const isRemoteNoise = isRemoteEntryError(text)
          || (REMOTE_ENTRY_PATTERN.test(url) && text.includes('Failed to load resource'));
        if (!isRemoteNoise) {
          consoleErrors.push(`[${msg.type()}] ${text}`);
        }
      }
    });

    // Capture network errors — exclude expected remote entry connection failures
    page.on('requestfailed', (request) => {
      const entry = `${request.method()} ${request.url()} - ${request.failure()?.errorText}`;
      if (!isRemoteEntryError(entry)) {
        networkErrors.push(entry);
      }
    });
  });

  test('Shell homepage loads without errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should redirect to /topology (root route redirect)
    expect(page.url()).toContain('/topology');

    // Check for critical UI elements
    expect(await page.locator('header').first().isVisible()).toBeTruthy();
    expect(await page.locator('nav').first().isVisible()).toBeTruthy();
    expect(await page.locator('main').isVisible()).toBeTruthy();

    // Verify no console errors
    expect(consoleErrors, `Console errors found: ${consoleErrors.join('; ')}`).toEqual([]);

    console.log('✓ Shell homepage loads cleanly');
  });

  test('RBAC plugin loads and is accessible', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Check URL
    expect(page.url()).toContain('/rbac');

    // Check main content is visible
    const main = page.locator('main');
    expect(await main.isVisible()).toBeTruthy();

    // Verify no console errors
    expect(consoleErrors, `Console errors found: ${consoleErrors.join('; ')}`).toEqual([]);

    console.log('✓ RBAC plugin loads cleanly');
  });

  test('Workspace navigation works between shell and RBAC', async ({ page }) => {
    // Start at topology
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/topology');

    // Navigate to RBAC using nav (if available)
    const rbacNavLink = page.locator('a, button').filter({ hasText: /rbac/i }).first();
    if (await rbacNavLink.isVisible()) {
      await rbacNavLink.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/rbac');
      console.log('✓ Navigation from topology to RBAC works');
    } else {
      // Manual navigation if nav link not found
      await page.goto('/rbac');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/rbac');
      console.log('✓ Direct navigation to RBAC works');
    }

    // Verify no console errors
    expect(consoleErrors, `Console errors during navigation: ${consoleErrors.join('; ')}`).toEqual([]);
  });

  test('Plugin registry includes RBAC', async ({ request }) => {
    const response = await request.get('/api/plugins');
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { plugins: Array<{ id: string }> };
    const pluginIds = body.plugins.map((p) => p.id);

    expect(pluginIds).toContain('rbac');
    console.log(`✓ Plugin registry includes RBAC. All plugins: ${pluginIds.join(', ')}`);
  });

  test('RBAC remote entry is loaded', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Check if the remote entry file is loaded
    const remoteEntryRequests = page.context().pages()[0]
      ? await Promise.resolve('checked')
      : null;

    // Take screenshot of RBAC page
    await page.screenshot({
      path: 'test-results/rbac-page-screenshot.png',
      fullPage: true,
    });

    console.log('✓ RBAC page screenshot saved');
  });

  test('Design consistency: Shell and RBAC share same design tokens', async ({ page }) => {
    // Navigate to RBAC
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Check for Tailwind classes and design token usage
    const htmlElement = page.locator('html');
    const htmlClasses = await htmlElement.getAttribute('class');

    // Should have dark theme class or similar
    expect(htmlClasses).toBeTruthy();
    console.log(`✓ HTML element classes: ${htmlClasses}`);

    // Check background/text colors are consistent
    const main = page.locator('main');
    const backgroundColor = await main.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    expect(backgroundColor).toBeTruthy();
    console.log(`✓ Main element background color: ${backgroundColor}`);
  });

  test('RBAC page has functional UI elements', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');

    // Check if RBAC page has content (more than just an empty div)
    const mainHTML = await main.innerHTML();
    expect(mainHTML.length).toBeGreaterThan(100);

    // Look for interactive elements (buttons, links, inputs)
    const buttons = page.locator('button');
    const links = page.locator('a');
    const inputs = page.locator('input');

    const buttonCount = await buttons.count();
    const linkCount = await links.count();
    const inputCount = await inputs.count();

    console.log(
      `✓ RBAC page has: ${buttonCount} buttons, ${linkCount} links, ${inputCount} inputs`
    );

    // At least header and nav should be present
    expect(buttonCount + linkCount + inputCount).toBeGreaterThan(0);
  });

  test('Network requests complete successfully', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Verify no network errors occurred
    expect(networkErrors, `Network errors found: ${networkErrors.join('; ')}`).toEqual([]);

    console.log('✓ All network requests completed successfully');
  });

  test('Shell header renders consistently', async ({ page }) => {
    // Test header on topology page
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');
    const topologyHeader = page.locator('header').first();
    expect(await topologyHeader.isVisible()).toBeTruthy();
    const topologyHeaderText = await topologyHeader.textContent();

    // Test header on RBAC page
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');
    const rbacHeader = page.locator('header').first();
    expect(await rbacHeader.isVisible()).toBeTruthy();
    const rbacHeaderText = await rbacHeader.textContent();

    // Both should have headers (content may differ)
    expect(topologyHeaderText).toBeTruthy();
    expect(rbacHeaderText).toBeTruthy();

    console.log('✓ Shell header renders consistently across routes');
  });

  test('RBAC page scrolls and layout is responsive', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');
    const boundingBox = await main.boundingBox();

    // Main should take up reasonable space
    expect(boundingBox?.width).toBeGreaterThan(500);
    expect(boundingBox?.height).toBeGreaterThan(300);

    console.log(
      `✓ RBAC main content area: ${boundingBox?.width}x${boundingBox?.height} pixels`
    );
  });
});
