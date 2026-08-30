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

async function load(page: Page) {
  await page.goto('/topology?ns=database%2Capi&nsMode=selected');
  await expect(page.getByRole('heading', { name: 'KubeGraph' })).toBeVisible();
  await expect(page.getByLabel('Change application data source')).toBeVisible();
}

test('root source selector opens and changes the entire workspace without runtime errors', async ({ page }) => {
  const errors = monitor(page);
  await load(page);
  const source = page.getByLabel('Change application data source');
  await source.click();
  await expect(page.getByRole('option', { name: /Live cluster/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Mock data/ })).toBeVisible();
  const liveRequest = page.waitForRequest(request => request.url().includes('/api/topology/nodes') && request.postDataJSON()?.mode === 'live');
  await page.getByRole('option', { name: /Live cluster/ }).click();
  await liveRequest;
  await expect(source).toContainText('Live cluster');
  await source.click();
  await page.getByRole('option', { name: /Mock data/ }).click();
  await expect(source).toContainText('Mock data');
  await expect(page.locator('.react-flow').getByText('database').first()).toBeVisible();
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('top-level workspaces, RBAC sub-tabs, and settings dialog are interactive', async ({ page }) => {
  const errors = monitor(page);
  await load(page);
  await Promise.all([
    page.waitForURL(url => url.pathname === '/rbac'),
    page.getByRole('link', { name: 'RBAC' }).click(),
  ]);
  await expect(page.getByRole('button', { name: 'Access management' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'My permissions' }).click();
  await expect(page.getByRole('heading', { name: 'My Kubernetes permissions' })).toBeVisible();
  await page.getByRole('button', { name: 'Fetch permissions' }).click();
  await expect(page.getByRole('columnheader', { name: 'Access area' })).toBeVisible();
  await page.getByLabel('Connection settings').click();
  await expect(page.getByRole('dialog', { name: 'Connection settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: 'Image Analysis' }).click();
  await expect(page.getByText('Image Analysis', { exact: true }).first()).toBeVisible();
  await page.getByPlaceholder('Search image, registry, pod, container or namespace').fill('nginx');
  await expect(page.getByRole('button', { name: 'Inspect' })).toHaveCount(0);
  await page.getByPlaceholder('Search image, registry, pod, container or namespace').fill('');
  await page.getByRole('button', { name: 'Inspect' }).first().click();
  await expect(page.getByRole('button', { name: 'Analyze image' })).toBeVisible();
  await page.getByRole('link', { name: 'Manifests' }).click();
  await expect(page.getByText('No manifest dataset loaded')).toBeVisible();
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.failedResponses).toEqual([]);
});

test('manifest upload ingests multi-container resources and exposes inventory/findings tabs', async ({ page }) => {
  const errors = monitor(page);
  await load(page);
  await page.getByRole('link', { name: 'Manifests' }).click();
  const manifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: demo
spec:
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      containers:
        - name: web
          image: nginx:latest
          ports: [{ containerPort: 80 }]
        - name: telemetry-sidecar
          image: otel/opentelemetry-collector:latest
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: demo
spec:
  selector: { app: web }
  ports: [{ port: 80, targetPort: 80 }]
`;
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'workload.yaml', mimeType: 'application/yaml', buffer: Buffer.from(manifest) });
  await expect(page.getByText('1 file(s) selected')).toBeVisible();
  await page.getByRole('button', { name: /Ingest 1/ }).click();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('2 objects').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Inventory' }).click();
  await page.getByPlaceholder('Search name, kind, namespace, app, or source').fill('web');
  await expect(page.getByText('Deployment', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: /Findings/ }).click();
  await expect(page.getByRole('tab', { name: 'Security posture' })).toBeVisible();
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.failedResponses).toEqual([]);
});

test('security sample workspace supports every section and read-only validation', async ({ page }) => {
  const errors = monitor(page);
  await load(page);
  await page.getByRole('link', { name: 'Security' }).click();
  await expect(page.getByText('Mock data', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Control coverage')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'RBAC attack paths' }).click();
  await expect(page.getByText('Prioritized paths')).toBeVisible();
  await page.getByRole('tab', { name: 'Network exposure' }).click();
  await page.getByPlaceholder('Search exposure').fill('api.example.test');
  await expect(page.getByRole('cell', { name: 'api.example.test' })).toBeVisible();
  await page.getByRole('tab', { name: 'Workload security' }).click();
  await expect(page.getByText('DaemonSet/debugger')).toBeVisible();
  await page.getByRole('tab', { name: 'Active tests' }).click();
  const run = page.getByRole('button', { name: /Run read-only validation/ });
  await expect(run).toBeDisabled();
  await page.getByText('I am authorized to assess this cluster').click();
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByText(/Sample authorization review/).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Reports' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^kubelinks-security-.*\.json$/);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.failedResponses).toEqual([]);
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'compact', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`responsive shell has no document overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await load(page);
    await page.screenshot({ path: `test-results/${viewport.name}-topology.png`, fullPage: true });
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth, `document width ${dimensions.scrollWidth} exceeds viewport ${dimensions.clientWidth}`).toBeLessThanOrEqual(dimensions.clientWidth);
    if (viewport.name === 'mobile') {
      await expect(page.getByLabel('Open filters')).toBeVisible();
      await expect(page.getByLabel('Change application data source')).toBeVisible();
      const security = page.getByRole('link', { name: 'Security' });
      await security.scrollIntoViewIfNeeded();
      await security.click();
      await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
      await page.screenshot({ path: 'test-results/mobile-security.png', fullPage: true });
    }
  });
}
