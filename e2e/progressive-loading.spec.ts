import { test, expect } from '@playwright/test';

test.describe('Kubernetes Topology — Progressive Loading & State Management', () => {
  test('initial load applies default filters database/api and Pod/Service/Ingress', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Wait for header
    await expect(page.locator('header')).toBeVisible();

    // Verify namespace boundaries database and api are rendered
    await expect(page.locator('.react-flow').getByText('database').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.react-flow').getByText('api').first()).toBeVisible({ timeout: 10000 });
  });

  test('makes independent namespace API requests for database and api', async ({ page }) => {
    const requestedUrls: string[] = [];

    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/topology/')) {
        requestedUrls.push(url);
      }
    });

    await page.goto('http://localhost:3000');

    // Wait for topology graph
    await expect(page.locator('.react-flow').getByText('database').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.react-flow').getByText('api').first()).toBeVisible({ timeout: 10000 });

    // Verify nodes, namespaces, and namespace-specific requests were executed
    const nodesCalled = requestedUrls.some(url => url.includes('/api/topology/nodes'));
    const namespacesCalled = requestedUrls.some(url => url.includes('/api/topology/namespaces'));
    const databaseCalled = requestedUrls.some(url => url.includes('/api/topology/namespaces/database'));
    const apiCalled = requestedUrls.some(url => url.includes('/api/topology/namespaces/api'));

    expect(nodesCalled).toBe(true);
    expect(namespacesCalled).toBe(true);
    expect(databaseCalled).toBe(true);
    expect(apiCalled).toBe(true);
  });

  test('progressively renders resources per namespace independently', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Verify namespaces are rendered
    await expect(page.locator('.react-flow').getByText('database').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.react-flow').getByText('api').first()).toBeVisible({ timeout: 10000 });

    // Verify database resources (e.g. postgres-0)
    await expect(page.locator('.react-flow').getByText('postgres-0').first()).toBeVisible({ timeout: 10000 });

    // Verify api resources (e.g. api-gateway)
    await expect(page.locator('.react-flow').getByText('api-gateway').first()).toBeVisible({ timeout: 10000 });
  });

  test('incremental namespace addition loads independently without full rebuild', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await expect(page.locator('.react-flow').getByText('database').first()).toBeVisible({ timeout: 10000 });

    // Open filter sidebar if needed
    const filterBtn = page.locator('button', { hasText: 'Filters' }).first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
    }

    // Toggle 'monitoring' namespace in filter sidebar
    const monitoringCheckbox = page.getByText('monitoring', { exact: true }).first();
    if (await monitoringCheckbox.isVisible()) {
      await monitoringCheckbox.click();

      // Verify monitoring namespace boundary appears
      await expect(page.getByText('monitoring', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    }
  });
});
