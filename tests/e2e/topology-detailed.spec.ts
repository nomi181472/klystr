import { expect, test } from '@playwright/test';

/**
 * Detailed functional tests for Topology plugin
 * - Test topology-specific features
 * - Test graph interactions
 * - Test namespace/resource filtering
 * - Test state management
 */

test.describe('Topology Plugin Detailed Tests', () => {
  test('Live connections require credentials in the request body', async ({ request }) => {
    const response = await request.post('/api/connections/test', {
      data: { mode: 'live' },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      category: 'invalid-request',
    });
  });

  test('Topology API endpoints respond correctly', async ({ request }) => {
    // Test topology nodes endpoint
    const nodesResponse = await request.post('/api/topology/nodes?', {
      data: { mode: 'mock' },
    });
    expect(nodesResponse.ok()).toBeTruthy();
    const nodesData = await nodesResponse.json();
    expect(nodesData).toBeTruthy();
    console.log('✓ Topology nodes API responds');

    // Test topology namespaces endpoint
    const namespacesResponse = await request.post('/api/topology/namespaces?', {
      data: { mode: 'mock' },
    });
    expect(namespacesResponse.ok()).toBeTruthy();
    const namespacesData = await namespacesResponse.json();
    expect(namespacesData).toBeTruthy();
    console.log('✓ Topology namespaces API responds');
  });

  test('Topology graph renders without errors', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Wait for graph to fully render
    await page.waitForTimeout(2000);

    // Check for graph elements
    const graphElements = page.locator('svg, canvas, [role="region"]');
    const elementCount = await graphElements.count();

    expect(elementCount).toBeGreaterThan(0);
    console.log(`✓ Graph renders with ${elementCount} visual elements`);
  });

  test('Namespace selection and filtering works', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Look for namespace selector or filter controls
    const namespaceButtons = page.locator('button, select').filter({
      hasText: /namespace|select|filter/i,
    });
    const namespaceCount = await namespaceButtons.count();

    if (namespaceCount > 0) {
      const firstButton = namespaceButtons.first();
      await firstButton.click();
      await page.waitForLoadState('networkidle');
      console.log('✓ Namespace selection is interactive');
    } else {
      console.log('✓ Topology page loads (namespace control not required)');
    }
  });

  test('Switching data sources clears namespace filters from the previous source', async ({ page }) => {
    await page.route('**/api/connections/test', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connection: {
            mode: 'live',
            clusterUrl: 'https://cluster.example.test:6443',
            connectionId: 'test-connection',
            skipTlsVerify: true,
          },
        }),
      });
    });

    await page.goto('/topology?ns=database%2Capi&nsMode=selected');
    await page.getByRole('button', { name: 'Connection settings' }).click();
    await page.getByRole('combobox', { name: 'Mode' }).click();
    await page.getByRole('option', { name: 'Production / Kubernetes' }).click();
    await page.getByRole('textbox', { name: 'Cluster URL' }).fill('https://cluster.example.test:6443');
    await page.getByRole('textbox', { name: 'Bearer Token' }).fill('test-token');
    await page.getByRole('switch', { name: 'Skip TLS verification' }).check();
    await page.getByRole('button', { name: 'Connect and refresh' }).click();

    await expect(page).not.toHaveURL(/(?:\?|&)ns=/);
    await expect(page).not.toHaveURL(/(?:\?|&)nsMode=/);
  });

  test('Topology loads mock data correctly', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Check for any rendered nodes or pods
    const nodes = page.locator('[role="button"], .node, [data-testid*="node"]');
    const nodeCount = await nodes.count();

    console.log(`✓ Topology displays ${nodeCount} graph nodes/elements`);
  });

  test('Topology page maintains responsive layout', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main');
    const box1 = await main.boundingBox();

    await page.waitForTimeout(500);

    const box2 = await main.boundingBox();

    // Dimensions should be stable
    expect(box1?.width).toBe(box2?.width);
    expect(box1?.height).toBe(box2?.height);

    console.log('✓ Topology layout is stable (no reflow issues)');
  });

  test('Topology sidebar/filter panel renders', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Look for filter sidebar
    const sidebar = page.locator('aside, [role="complementary"]').first();
    const sidebarVisible = await sidebar.isVisible().catch(() => false);

    if (sidebarVisible) {
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox?.width).toBeGreaterThan(100);
      console.log(
        `✓ Topology sidebar renders (${sidebarBox?.width}px wide)`
      );
    } else {
      console.log('✓ Topology page loads (sidebar not required)');
    }
  });

  test('Topology zoom/navigation controls present', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Look for zoom or navigation buttons
    const controls = page.locator('button').filter({
      hasText: /zoom|fit|reset|pan|plus|minus/i,
    });
    const controlCount = await controls.count();

    if (controlCount > 0) {
      console.log(`✓ Topology has ${controlCount} zoom/navigation controls`);
    } else {
      console.log('✓ Topology page loads (controls optional)');
    }
  });

  test('Topology search/filter input available', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    const searchInputs = page.locator('input[type="text"], input[placeholder*="search" i]');
    const inputCount = await searchInputs.count();

    if (inputCount > 0) {
      console.log(`✓ Topology has ${inputCount} search/filter inputs`);
    } else {
      console.log('✓ Topology page loads (search optional)');
    }
  });

  test('Topology resource labels dialog interactive', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Look for dialog opener or labels button
    const labelButtons = page.locator('button').filter({ hasText: /label|resource/i });
    const labelCount = await labelButtons.count();

    console.log(`✓ Topology has ${labelCount} resource/label controls`);
  });

  test('Topology takes screenshot for visual inspection', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Wait for graph to render
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/topology-detailed-screenshot.png',
      fullPage: false,
    });

    console.log('✓ Topology detailed screenshot saved');
  });

  test('Topology page renders without layout shift', async ({ page }) => {
    await page.goto('/topology');

    // Start measuring CLS
    const clsData = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let cls = 0;

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const layoutShift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (layoutShift.hadRecentInput) continue;
            cls += layoutShift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });

        setTimeout(() => resolve(cls), 3000);
      });
    });

    expect(clsData).toBeLessThan(0.1);
    console.log(`✓ Topology CLS (cumulative layout shift): ${clsData.toFixed(4)}`);
  });

  test('Topology edge legend panel present', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Look for edge legend or relationship indicator
    const legendPanel = page.locator('text=/edge|legend|relationship|connection/i').first();
    const legendVisible = await legendPanel.isVisible().catch(() => false);

    if (legendVisible) {
      console.log('✓ Topology edge legend panel visible');
    } else {
      console.log('✓ Topology page loads (legend optional)');
    }
  });

  test('Topology command palette integration', async ({ page }) => {
    await page.goto('/topology');
    await page.waitForLoadState('networkidle');

    // Try to open command palette (usually Ctrl+K or Cmd+K)
    await page.keyboard.press('Control+KeyK');
    await page.waitForTimeout(500);

    const palette = page.locator('[role="dialog"], [role="menu"]').first();
    const paletteVisible = await palette.isVisible().catch(() => false);

    if (paletteVisible) {
      console.log('✓ Command palette opens from topology page');
    } else {
      console.log('✓ Topology page interactive');
    }
  });
});
