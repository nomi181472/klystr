import { expect, test, type Page } from '@playwright/test';

/**
 * E2E tests for the Telemetry → Live Networking sub-module.
 *
 * Covers:
 *  - Page structure: header, sub-tab strip, and graph canvas mount
 *  - Sub-tab navigation: "Live Networking" tab is active by default
 *  - Filter controls: Namespace, Pod multi-select, Metric, Aggregator dropdowns
 *  - Pod multi-select: individual pods can be toggled
 *  - Metric labels update live (appear on graph edges)
 *  - Trend sparkline: click label → popover appears; click canvas → closes
 *  - Aggregator reset: switching aggregator resets accumulated values
 *  - No page errors or console errors during the session
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trackErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}

async function goToTelemetry(page: Page) {
  await page.goto('/telemetry');
  // Wait for the dynamic TelemetryWorkspace to mount (ssr: false)
  await expect(page.getByRole('heading', { name: 'Telemetry' })).toBeVisible({ timeout: 15_000 });
}

async function waitForGraphCanvas(page: Page) {
  // ReactFlow renders a .react-flow element
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Telemetry → Live Networking', () => {
  // ── Page structure ─────────────────────────────────────────────────────

  test('renders the Telemetry page header and Live Networking sub-tab', async ({ page }) => {
    const errors = trackErrors(page);
    await goToTelemetry(page);

    // PageHeader title
    await expect(page.getByRole('heading', { name: 'Telemetry' })).toBeVisible();

    // Sub-tab strip contains "Live Networking"
    const liveNetTab = page.getByRole('tab', { name: /live networking/i });
    await expect(liveNetTab).toBeVisible();
    // It should be the active (selected) tab by default
    await expect(liveNetTab).toHaveAttribute('data-active', '');

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });

  test('renders the ReactFlow network graph canvas inside Live Networking', async ({ page }) => {
    const errors = trackErrors(page);
    await goToTelemetry(page);
    await waitForGraphCanvas(page);

    // At least one pod node should be present (mock has 6 nodes)
    const podNodes = page.locator('.react-flow__node');
    await expect(podNodes.first()).toBeVisible({ timeout: 10_000 });
    const count = await podNodes.count();
    expect(count).toBeGreaterThanOrEqual(1);

    expect(errors.pageErrors).toEqual([]);
  });

  // ── Filter controls ─────────────────────────────────────────────────────

  test('namespace dropdown is visible and defaults to "All"', async ({ page }) => {
    await goToTelemetry(page);
    // The namespace select should contain an "All" option selected
    const ns = page.locator('select').filter({ hasText: /all/i }).first();
    await expect(ns).toBeVisible();
    await expect(ns).toHaveValue('all');
  });

  test('metric dropdown lists all 5 TCP metrics', async ({ page }) => {
    await goToTelemetry(page);

    // Find the Metric select by its options
    const metricSelect = page.locator('select').filter({ hasText: /Throughput/i }).first();
    await expect(metricSelect).toBeVisible();

    const options = metricSelect.locator('option');
    await expect(options).toHaveCount(5);
    await expect(options.nth(0)).toContainText(/Throughput/i);
    await expect(options.nth(1)).toContainText(/Packet Rate/i);
    await expect(options.nth(2)).toContainText(/Active TCP/i);
    await expect(options.nth(3)).toContainText(/Retransmission/i);
    await expect(options.nth(4)).toContainText(/RTT/i);
  });

  test('aggregator dropdown lists all 4 aggregation methods', async ({ page }) => {
    await goToTelemetry(page);

    const aggSelect = page.locator('select').filter({ hasText: /Instantaneous/i }).first();
    await expect(aggSelect).toBeVisible();

    const options = aggSelect.locator('option');
    await expect(options).toHaveCount(4);
    await expect(options.nth(0)).toContainText(/Instantaneous/i);
    await expect(options.nth(1)).toContainText(/Sum/i);
    await expect(options.nth(2)).toContainText(/Average/i);
    await expect(options.nth(3)).toContainText(/Max/i);
  });

  // ── Pod multi-select ─────────────────────────────────────────────────────

  test('Pods dropdown opens with pod checkboxes and closes on outside click', async ({ page }) => {
    await goToTelemetry(page);

    // Click the Pods button to open dropdown
    const podsButton = page.getByRole('button', { name: /all pods/i });
    await expect(podsButton).toBeVisible();
    await podsButton.click();

    // "All Pods" option and individual pod rows should appear
    await expect(page.getByText('All Pods', { exact: true }).first()).toBeVisible();

    // Close by clicking the canvas area
    await page.locator('.react-flow').click();
    await expect(page.getByText('All Pods', { exact: true }).first()).toBeHidden();
  });

  test('selecting a specific pod filters the graph (fewer edges visible)', async ({ page }) => {
    await goToTelemetry(page);
    await waitForGraphCanvas(page);

    const edgesBefore = await page.locator('.react-flow__edge').count();

    // Open pods dropdown
    const podsButton = page.getByRole('button', { name: /all pods/i });
    await podsButton.click();

    // Select only one pod (the first pod row after "All Pods" divider)
    const podRows = page.locator('[class*="cursor-pointer"]').filter({ hasNot: page.getByText('All Pods') });
    const firstPod = podRows.first();
    await firstPod.click();

    // Close dropdown
    await page.locator('.react-flow').click();

    // Pods button text should show "1 selected"
    await expect(podsButton).toContainText('1 selected');

    // After filtering to a single pod, there should be 0 edges (single node has no edges to itself)
    // or fewer edges than before if multiple pods were connected
    const edgesAfter = await page.locator('.react-flow__edge').count();
    expect(edgesAfter).toBeLessThanOrEqual(edgesBefore);
  });

  test('deselecting pods by clicking "All Pods" resets to full graph', async ({ page }) => {
    await goToTelemetry(page);
    await waitForGraphCanvas(page);

    const initialEdges = await page.locator('.react-flow__edge').count();

    // Select one pod
    const podsButton = page.getByRole('button', { name: /all pods/i });
    await podsButton.click();
    const podRows = page.locator('[class*="cursor-pointer"]').filter({ hasNot: page.getByText('All Pods') });
    await podRows.first().click();
    await page.locator('.react-flow').click();

    // Re-open and click "All Pods" to reset
    await podsButton.click();
    await page.getByText('All Pods', { exact: true }).first().click();
    await page.locator('.react-flow').click();

    await expect(podsButton).toContainText('All Pods');
    const restoredEdges = await page.locator('.react-flow__edge').count();
    expect(restoredEdges).toBe(initialEdges);
  });

  // ── Live metric labels ───────────────────────────────────────────────────

  test('edge labels appear on the graph with metric values after simulation starts', async ({ page }) => {
    await goToTelemetry(page);
    await waitForGraphCanvas(page);

    // Wait up to 3 seconds for the first live tick (interval = 1000ms)
    await page.waitForTimeout(2500);

    // Edge labels are rendered inside EdgeLabelRenderer — they show KB/s, pps, conn etc.
    // Use a broad text matcher for any metric label pill
    const edgeLabels = page.locator('.react-flow__edgelabels').locator('[class*="rounded-full"]');
    const labelCount = await edgeLabels.count();
    expect(labelCount).toBeGreaterThan(0);
  });

  // ── Trend sparkline popover ──────────────────────────────────────────────

  test('clicking a metric label opens the trend sparkline popover', async ({ page }) => {
    await goToTelemetry(page);
    await waitForGraphCanvas(page);

    // Wait for at least 3 ticks so history has enough points for the sparkline
    await page.waitForTimeout(3500);

    // Click the first metric label pill
    const firstLabel = page.locator('.react-flow__edgelabels').locator('[class*="rounded-full"]').first();
    await expect(firstLabel).toBeVisible({ timeout: 5_000 });
    await firstLabel.click();

    // The popover should appear — it contains the SVG sparkline
    const popover = page.locator('.react-flow__edgelabels').locator('svg').first();
    await expect(popover).toBeVisible({ timeout: 3_000 });
  });

  test('clicking canvas background closes the trend sparkline popover', async ({ page }) => {
    await goToTelemetry(page);
    await waitForGraphCanvas(page);
    await page.waitForTimeout(3500);

    // Open the popover
    const firstLabel = page.locator('.react-flow__edgelabels').locator('[class*="rounded-full"]').first();
    await firstLabel.click();
    const popover = page.locator('.react-flow__edgelabels').locator('svg').first();
    await expect(popover).toBeVisible({ timeout: 3_000 });

    // Click the empty canvas pane to close
    await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
    await expect(popover).toBeHidden({ timeout: 3_000 });
  });

  // ── Aggregator switching ─────────────────────────────────────────────────

  test('switching the aggregator changes the label text format', async ({ page }) => {
    await goToTelemetry(page);
    await waitForGraphCanvas(page);
    await page.waitForTimeout(2500);

    const metricSelect = page.locator('select').filter({ hasText: /Throughput/i }).first();
    const aggSelect = page.locator('select').filter({ hasText: /Instantaneous/i }).first();

    // Instantaneous shows KB/s or MB/s
    await metricSelect.selectOption('throughput');
    await aggSelect.selectOption('instantaneous');
    await page.waitForTimeout(1500);
    const instantLabel = page.locator('.react-flow__edgelabels').locator('[class*="rounded-full"]').first();
    const instantText = await instantLabel.innerText();
    expect(instantText).toMatch(/KB\/s|MB\/s/);

    // Switch to Sum — should now show KB, MB, or GB (no /s)
    await aggSelect.selectOption('sum');
    await page.waitForTimeout(1500);
    const sumText = await instantLabel.innerText();
    // Sum text should NOT contain /s
    expect(sumText).not.toMatch(/\/s/);
    expect(sumText).toMatch(/KB|MB|GB/);
  });

  test('switching metric to Packet Rate changes label unit to pps', async ({ page }) => {
    await goToTelemetry(page);
    await waitForGraphCanvas(page);
    await page.waitForTimeout(2500);

    const metricSelect = page.locator('select').filter({ hasText: /Throughput/i }).first();
    await metricSelect.selectOption('packetRate');
    await page.waitForTimeout(1500);

    const label = page.locator('.react-flow__edgelabels').locator('[class*="rounded-full"]').first();
    const text = await label.innerText();
    expect(text).toMatch(/pps|pkts/);
  });

  // ── No runtime errors ────────────────────────────────────────────────────

  test('no page or console errors during a full session with multiple interactions', async ({ page }) => {
    const errors = trackErrors(page);
    await goToTelemetry(page);
    await waitForGraphCanvas(page);

    // Wait for simulation ticks
    await page.waitForTimeout(3000);

    // Change metric
    const metricSelect = page.locator('select').filter({ hasText: /Throughput/i }).first();
    await metricSelect.selectOption('tcpRtt');
    await page.waitForTimeout(1000);

    // Change aggregator
    const aggSelect = page.locator('select').filter({ hasText: /Instantaneous/i }).first();
    await aggSelect.selectOption('max');
    await page.waitForTimeout(1000);

    // Open and close pod dropdown
    const podsButton = page.getByRole('button', { name: /all pods/i });
    await podsButton.click();
    await page.locator('.react-flow').click();

    // Change namespace
    const nsSelect = page.locator('select').filter({ hasText: /all/i }).first();
    await nsSelect.selectOption('default');
    await page.waitForTimeout(1000);

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
