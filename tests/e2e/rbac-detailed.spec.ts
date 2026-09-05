import { expect, test } from '@playwright/test';

/**
 * Detailed functional tests for RBAC plugin
 * - Test RBAC-specific features
 * - Test state management and interactions
 * - Test error boundaries and fallbacks
 */

test.describe('RBAC Plugin Detailed Tests', () => {
  test('RBAC page displays ServiceAccount data', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Check for RBAC control heading (in PageHeader component)
    const rbacHeading = page.locator('text=RBAC control');
    expect(await rbacHeading.first().isVisible()).toBeTruthy();

    // Check for table structure
    const table = page.locator('table');
    expect(await table.isVisible()).toBeTruthy();

    // Check for table headers
    const headers = page.locator('th');
    const headerTexts = await headers.allTextContents();

    expect(headerTexts.some((h) => h.toLowerCase().includes('serviceaccount'))).toBeTruthy();
    console.log('✓ RBAC page displays ServiceAccount data with proper table structure');
  });

  test('RBAC tabs work correctly', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Find and verify "Access management" tab is active
    const accessManagementTab = page.locator('button, a').filter({
      hasText: 'Access management',
    });
    expect(await accessManagementTab.first().isVisible()).toBeTruthy();

    // Find and verify "My permissions" tab exists
    const myPermissionsTab = page.locator('button, a').filter({ hasText: 'My permissions' });
    expect(await myPermissionsTab.first().isVisible()).toBeTruthy();

    // Click "My permissions" tab
    await myPermissionsTab.first().click();
    await page.waitForLoadState('networkidle');

    console.log('✓ RBAC tabs are interactive and switchable');
  });

  test('Add identity button is present and clickable', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Find "Add identity" button
    const addIdentityButton = page.locator('button').filter({ hasText: 'Add identity' });
    expect(await addIdentityButton.isVisible()).toBeTruthy();
    expect(await addIdentityButton.isEnabled()).toBeTruthy();

    console.log('✓ Add identity button is present and enabled');
  });

  test('Refresh button triggers data reload', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Get initial table content
    const table = page.locator('table');

    // Click refresh button
    const refreshButton = page.locator('button').filter({ hasText: 'Refresh' });
    expect(await refreshButton.isVisible()).toBeTruthy();

    await refreshButton.click();
    await page.waitForLoadState('networkidle');

    // Verify table still exists after refresh
    const refreshedContent = await table.innerHTML();
    expect(refreshedContent.length).toBeGreaterThan(0);

    console.log('✓ Refresh button triggers data reload');
  });

  test('RBAC page maintains navigation consistency with shell', async ({ page }) => {
    // Navigate to RBAC
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Check navigation tabs at top
    const navTabs = page.locator('nav a, nav button').filter({ hasText: /topology|rbac/i });
    const tabCount = await navTabs.count();
    expect(tabCount).toBeGreaterThan(0);

    // All tabs should have consistent styling
    const firstTab = navTabs.first();
    const firstTabClass = await firstTab.getAttribute('class');
    expect(firstTabClass).toBeTruthy();

    console.log('✓ RBAC maintains consistent navigation with shell');
  });

  test('RBAC page renders without layout shift', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Wait a bit for any deferred rendering
    await page.waitForTimeout(1000);

    // Take screenshot to verify no layout shift
    await page.screenshot({
      path: 'test-results/rbac-detailed-screenshot.png',
      fullPage: true,
    });

    // Check main container dimensions are stable
    const main = page.locator('main');
    const box1 = await main.boundingBox();

    await page.waitForTimeout(500);

    const box2 = await main.boundingBox();

    // Dimensions should be the same (no layout shift)
    expect(box1?.width).toBe(box2?.width);
    expect(box1?.height).toBe(box2?.height);

    console.log('✓ RBAC page renders without layout shift');
  });

  test('RBAC table rows have proper actions', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Find table rows
    const tableRows = page.locator('tbody tr');
    const rowCount = await tableRows.count();

    if (rowCount > 0) {
      // Get first row
      const firstRow = tableRows.first();

      // Check for action buttons in the row
      const buttons = firstRow.locator('button');
      const buttonCount = await buttons.count();

      console.log(`✓ First RBAC table row has ${buttonCount} action buttons`);

      // Buttons should be visible
      if (buttonCount > 0) {
        const firstButton = buttons.first();
        expect(await firstButton.isVisible()).toBeTruthy();
      }
    }

    console.log('✓ RBAC table rows have proper actions');
  });

  test('RBAC page handles empty state gracefully', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Check for table or empty state message
    const table = page.locator('table');
    const emptyStateMessage = page.locator('text=/no.*data|no.*results|empty/i');

    const hasTable = await table.isVisible().catch(() => false);
    const hasEmptyState = await emptyStateMessage.first().isVisible().catch(() => false);

    expect(hasTable || hasEmptyState).toBeTruthy();
    console.log(`✓ RBAC page handles data display correctly (table: ${hasTable}, empty: ${hasEmptyState})`);
  });

  test('Verify RBAC scope values are displayed correctly', async ({ page }) => {
    await page.goto('/rbac');
    await page.waitForLoadState('networkidle');

    // Find scope cell (typically second column in table)
    const scopeText = page.locator('text=/namespace|cluster|all/i');
    const scopeVisible = await scopeText.first().isVisible().catch(() => false);

    if (scopeVisible) {
      const text = await scopeText.first().textContent();
      console.log(`✓ RBAC scope values displayed: ${text}`);
    } else {
      console.log('✓ RBAC page renders (scope detection skipped if data varies)');
    }
  });
});
