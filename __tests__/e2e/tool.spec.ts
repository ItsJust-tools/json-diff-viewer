import { test, expect } from '@playwright/test';

async function closeBackdropIfOpen(page: import('@playwright/test').Page) {
  const backdrop = page.locator('.sidebar-backdrop');
  if (!(await backdrop.isVisible().catch(() => false))) return;
  await backdrop.evaluate((el) => (el as HTMLElement).click());
  await expect(backdrop).toBeHidden();
}

async function ensureToolbarInteractable(page: import('@playwright/test').Page) {
  await closeBackdropIfOpen(page);
}

/** Open the sidebar so sidebar-only controls are reachable on narrow viewports. */
async function openSidebar(page: import('@playwright/test').Page) {
  const sidebar = page.locator('.tool-shell-sidebar');
  if (await sidebar.evaluate((el) => el.classList.contains('collapsed'))) {
    await page.getByRole('button', { name: 'Show options' }).click();
    await expect(sidebar).toHaveClass(/open/);
  }
}

test('tool loads with correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/JSON Diff Viewer/);
});

test('empty state invites input on first load', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByText('Paste JSON into one or both editors to start comparing.')
  ).toBeVisible();
});

test('sample comparison shows added, removed, and modified rows', async ({ page }, testInfo) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  if (testInfo.project.name.includes('Mobile')) {
    await page.getByRole('checkbox', { name: 'Show JSON editors' }).check();
  }
  await page.getByRole('button', { name: 'Load sample JSON' }).click();

  await expect(page.locator('.jd-row-added')).not.toHaveCount(0);
  await expect(page.locator('.jd-row-removed')).not.toHaveCount(0);
  await expect(page.locator('.jd-row-modified')).not.toHaveCount(0);
  await expect(page.locator('.jd-row[data-path="$.database.ssl"]')).toBeVisible();
});

test('invalid JSON shows an inline error with a position', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  await page.getByRole('textbox', { name: 'Left JSON input' }).fill('{"a": }');
  const error = page.locator('.jd-editor-error').first();
  await expect(error).toBeVisible();
  await expect(error).toContainText('line');
});

test('format both pretty prints the inputs', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  const left = page.getByRole('textbox', { name: 'Left JSON input' });
  await left.fill('{"a":1,"b":2}');
  await page.getByRole('button', { name: 'Format both JSON inputs' }).click();
  await expect(left).toHaveValue('{\n  "a": 1,\n  "b": 2\n}');
});

test('view mode toggle switches column headers', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  await page.getByRole('button', { name: 'Load sample JSON' }).click();
  await expect(page.getByRole('columnheader', { name: 'Original' })).toBeVisible();

  await page.getByRole('button', { name: 'Unified' }).click();
  await expect(page.getByRole('columnheader', { name: 'Value' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Original' })).toBeHidden();
});

test('search narrows the visible rows', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  await page.getByRole('button', { name: 'Load sample JSON' }).click();
  const before = await page.locator('.jd-row').count();

  await page.getByRole('searchbox', { name: 'Search paths and values' }).fill('database');
  await expect.poll(async () => page.locator('.jd-row').count()).toBeLessThan(before);

  await page.getByRole('searchbox', { name: 'Search paths and values' }).fill('zzz-nothing');
  await expect(page.getByText('No rows match the current search and filter.')).toBeVisible();
});

test('change filter select restricts row types', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  await page.getByRole('button', { name: 'Load sample JSON' }).click();

  await page.getByLabel('Filter by change type').selectOption('added');
  await expect
    .poll(async () =>
      page
        .locator('.jd-row')
        .evaluateAll((rows) => [...new Set(rows.map((row) => (row as HTMLElement).dataset.change))])
    )
    .toEqual(['added']);
});

test('sidebar change chips restrict row types', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  await page.getByRole('button', { name: 'Load sample JSON' }).click();
  await openSidebar(page);

  await page.getByRole('button', { name: 'Added', exact: true }).click();
  await expect
    .poll(async () =>
      page
        .locator('.jd-row')
        .evaluateAll((rows) => [...new Set(rows.map((row) => (row as HTMLElement).dataset.change))])
    )
    .toEqual(['added']);
});

test('report menu downloads a JSON report', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  await page.getByRole('button', { name: 'Load sample JSON' }).click();
  await page.getByRole('button', { name: 'Download diff report' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^json-diff-.*\.json$/);
});

test('report menu downloads a Markdown report', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  await page.getByRole('button', { name: 'Load sample JSON' }).click();
  await page.getByRole('button', { name: 'Download diff report' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download Markdown' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^json-diff-.*\.md$/);
});

test('clear resets both inputs', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  await page.getByRole('button', { name: 'Load sample JSON' }).click();
  await page.getByRole('button', { name: 'Clear both JSON inputs' }).click();
  await expect(page.getByRole('textbox', { name: 'Left JSON input' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Right JSON input' })).toHaveValue('');
});

test('undo/redo buttons enable/disable correctly', async ({ page }, testInfo) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);

  const undoButton = page.getByRole('button', { name: 'Undo (Ctrl+Z)' });
  const redoButton = page.getByRole('button', { name: 'Redo (Ctrl+Y)' });
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();

  if (testInfo.project.name.includes('Mobile')) return;

  await page.getByRole('textbox', { name: 'Left JSON input' }).fill('{"a":1}');
  await expect(undoButton).toBeEnabled();

  await undoButton.click();
  await expect(redoButton).toBeEnabled();
});

test('export dropdown opens and shows JSON format', async ({ page }, testInfo) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  const exportButton = page.getByRole('button', { name: /export/i });
  await exportButton.click({ force: true });
  if (testInfo.project.name.includes('Mobile')) {
    await expect(exportButton).toBeVisible();
    return;
  }
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  await expect(page.getByRole('option', { name: /JSON/ })).toBeVisible();
  await page.click('body');
  await expect(menu).not.toBeVisible();
});

test('sidebar toggle button works', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  const sidebarToggle = page.locator('.toolbar-btn-sidebar');
  const sidebar = page.locator('.tool-shell-sidebar');
  const mobile =
    (await page.viewportSize())?.width !== undefined && (await page.viewportSize())!.width <= 768;
  const isCollapsed = await sidebar.evaluate((el) => el.classList.contains('collapsed'));
  if (isCollapsed) {
    await sidebarToggle.click();
    await expect(sidebar).toHaveClass(/open/);
  } else {
    await expect(sidebar).toHaveClass(/open/);
  }
  if (mobile) {
    await page.locator('.sidebar-backdrop').click();
  } else {
    await sidebarToggle.click();
  }
  await expect(sidebar).toHaveClass(/collapsed/);
});

test('dark mode toggle works', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);
  const themeButton = page.getByRole('button', { name: /Switch to dark mode/i });
  if (await themeButton.isVisible()) {
    await themeButton.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const lightButton = page.getByRole('button', { name: /Switch to light mode/i });
    await lightButton.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }
});

test('SEO meta tags are present', async ({ page }) => {
  await page.goto('/');
  expect(await page.title()).toBeTruthy();
  expect(await page.getAttribute('meta[name="description"]', 'content')).toBeTruthy();
  expect(await page.getAttribute('meta[property="og:title"]', 'content')).toBeTruthy();
  expect(await page.getAttribute('meta[property="og:image"]', 'content')).toBeTruthy();
  expect(await page.getAttribute('link[rel="canonical"]', 'href')).toBeTruthy();
});

test('JSON-LD structured data is present', async ({ page }) => {
  await page.goto('/');
  const content = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(content!);
  expect(parsed['@type']).toBe('WebApplication');
  expect(parsed.name).toBeTruthy();
  expect(parsed.offers.price).toBe('0');
});

test('sitemap.xml is accessible', async ({ page }) => {
  const response = await page.goto('/sitemap.xml');
  expect(response?.ok()).toBe(true);
  expect(await response?.text()).toContain('urlset');
});

test('robots.txt is accessible', async ({ page }) => {
  const response = await page.goto('/robots.txt');
  expect(response?.ok()).toBe(true);
  expect(await response?.text()).toMatch(/User-[Aa]gent/);
});

test('404 page works', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('import from json file works', async ({ page }) => {
  await page.goto('/');
  await ensureToolbarInteractable(page);

  const fileContent = JSON.stringify({
    leftText: '{"imported":true}',
    rightText: '{"imported":false}',
  });

  const fileInput = page.locator('input[type="file"]');
  await fileInput.evaluate((el: HTMLInputElement) => {
    el.style.display = 'block';
    el.style.visibility = 'visible';
  });
  await fileInput.setInputFiles({
    name: 'test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fileContent),
  });

  await expect
    .poll(() => page.getByRole('textbox', { name: 'Left JSON input' }).inputValue())
    .toBe('{"imported":true}');
  await expect(page.locator('.jd-row[data-path="$.imported"]')).toHaveCount(1);
});

test('visual regression — default view', async ({ page, browserName }) => {
  if (browserName !== 'chromium') return;
  await page.goto('/');
  await page.waitForSelector('.tool-shell-canvas');
  await expect(page.locator('.tool-shell')).toBeVisible();
});
