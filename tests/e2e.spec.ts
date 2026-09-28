import { expect, test, type Page } from '@playwright/test';

const search = (page: Page) => page.getByRole('searchbox', { name: 'Rechercher une chaîne' });
const cards = (page: Page) => page.locator('.channel-card');
const selectedName = (page: Page) => page.locator('.now-name h2');

test.beforeEach(async ({ context, page }) => {
  // Exercise the shipped real catalog without races from its optional live refresh.
  // Every test receives a new browser context, so favorites start empty.
  await context.route('https://iptv-org.github.io/iptv/index.m3u', route => route.abort());
  await page.goto('/');
  await expect(cards(page).first()).toBeVisible();
});

test('catalog and controls fit desktop, mobile, and narrow screens', async ({ page }, testInfo) => {
  const widths = testInfo.project.name === 'mobile' ? [390, 320] : [1440, 1024, 768];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document, `document overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body, `body overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole('button', { name: 'Mes favoris' })).toBeVisible();
  }
});

test('search ignores accents and recovers from an empty result', async ({ page }) => {
  await search(page).fill('États-Unis');
  await expect(cards(page).first()).toBeVisible();
  const accented = await cards(page).locator('h3').allTextContents();
  expect(accented.length).toBeGreaterThan(0);
  await search(page).fill('etats-unis');
  await expect(cards(page).locator('h3')).toHaveText(accented);
  await search(page).fill('no-such-channel-7c501e9c');
  await expect(page.getByRole('heading', { name: 'Aucune chaîne sur cette fréquence.' })).toBeVisible();
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(search(page)).toHaveValue('');
  await expect(cards(page).first()).toBeVisible();
});

test('country and category filters combine and reset', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Filtrer par pays' }).selectOption('FR');
  await page.getByRole('combobox', { name: 'Filtrer par catégorie' }).selectOption('News');
  await search(page).fill('France 24');
  await expect(cards(page).first()).toBeVisible();
  const names = await cards(page).locator('h3').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(names.every(name => name.includes('France 24'))).toBeTruthy();
  await expect(cards(page).locator('.card-description p')).toHaveText(names.map(() => 'Actualités'));
  await page.getByRole('combobox', { name: 'Filtrer par pays' }).selectOption('US');
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(page.getByRole('combobox', { name: 'Filtrer par pays' })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Filtrer par catégorie' })).toHaveValue('');
  await expect(cards(page).first()).toBeVisible();
});

test('favorites persist after reload and work through both navigation controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Mes favoris', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Votre sélection commence ici.' })).toBeVisible();
  await page.getByRole('button', { name: 'Explorer les chaînes', exact: true }).click();
  const name = await cards(page).first().locator('h3').innerText();
  await cards(page).first().getByRole('button', { name: `Ajouter ${name} aux favoris`, exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: /Mes favoris/ }).click();
  await expect(cards(page).locator('h3')).toHaveText([name]);
  await page.reload();
  await expect(cards(page).first()).toBeVisible();
  await page.getByRole('button', { name: 'Favoris', exact: true }).click();
  await expect(cards(page).locator('h3')).toHaveText([name]);
  await expect(cards(page).getByRole('button', { name: `Retirer ${name} des favoris`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation').getByRole('button', { name: 'Télévision', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Le monde est au programme.' })).toBeVisible();
  expect(await cards(page).count()).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Favoris', exact: true }).click();
  await cards(page).getByRole('button', { name: `Retirer ${name} des favoris`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Votre sélection commence ici.' })).toBeVisible();
});

test('a selected channel can be shared and restored by its deep link', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await search(page).fill('France 24');
  await page.getByRole('button', { name: 'Regarder France 24 (Anglais)', exact: true }).click();
  await expect(selectedName(page)).toHaveText('France 24 (Anglais)');
  await expect(page).toHaveURL(/chaine=France24.fr%40English/);
  await page.getByRole('button', { name: 'Partager cette chaîne' }).click();
  await expect(page.getByText('Lien de la chaîne copié', { exact: true })).toBeVisible();
  const sharedURL = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(sharedURL).searchParams.get('chaine')).toBe('France24.fr@English');
  const sharedPage = await context.newPage();
  await sharedPage.goto(sharedURL);
  await expect(selectedName(sharedPage)).toHaveText('France 24 (Anglais)');
  await sharedPage.close();
});

test('pagination appends channels and searching resets the visible page', async ({ page }) => {
  const initialNames = await cards(page).locator('h3').allTextContents();
  const initialCount = initialNames.length;
  await page.getByRole('button', { name: 'Voir plus de chaînes' }).click();
  await expect.poll(() => cards(page).count()).toBeGreaterThan(initialCount);
  const expandedNames = await cards(page).locator('h3').allTextContents();
  expect(expandedNames.slice(0, initialCount)).toEqual(initialNames);
  await search(page).fill('France 24');
  await expect(cards(page).first()).toBeVisible();
  await search(page).fill('');
  await expect(cards(page)).toHaveCount(initialCount);
});

test('help dialog keeps page focus modal, blocks shortcuts, and closes with Escape', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'À propos & aide', exact: true });
  const before = await selectedName(page).innerText();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBeTruthy();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    // Native Chromium dialogs also allow tabbing into browser chrome. When the
    // document has focus, it must stay inside the dialog, never in the backdrop.
    expect(await dialog.evaluate(element => !document.hasFocus() || element.contains(document.activeElement))).toBeTruthy();
  }
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('/');
  await expect(selectedName(page)).toHaveText(before);
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button', { name: 'Fermer l’aide' }).click();
  await expect(dialog).not.toBeVisible();
});

test('previous zapping enters the last filtered channel and next wraps to the first', async ({ page }) => {
  await search(page).fill('TV5MONDE');
  await expect(cards(page).first()).toBeVisible();
  const names = await cards(page).locator('h3').allTextContents();
  expect(names.length).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Voir plus de chaînes' })).toHaveCount(0);
  expect(names).not.toContain(await selectedName(page).innerText());
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(selectedName(page)).toHaveText(names.at(-1)!);
  await page.keyboard.press('ArrowRight');
  await expect(selectedName(page)).toHaveText(names[0]);
});

test('the search keyboard shortcut moves focus without selecting another channel', async ({ page }) => {
  const before = await selectedName(page).innerText();
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('/');
  await expect(search(page)).toBeFocused();
  await page.keyboard.type('France');
  await expect(search(page)).toHaveValue('France');
  await page.keyboard.press('ArrowRight');
  await expect(selectedName(page)).toHaveText(before);
});
