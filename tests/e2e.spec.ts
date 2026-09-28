import { expect, test, type Page } from '@playwright/test';
import type { Catalog } from '../src/lib/types';

const search = (page: Page) => page.locator('#catalogue').getByRole('searchbox', { name: 'Rechercher une chaîne', exact: true });
const cards = (page: Page) => page.locator('#catalogue .channel-card');
const selectedName = (page: Page) => page.locator('.now-name h2');
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });
const homeHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Le monde n’attend pas.' });
const trends = (page: Page) => page.getByRole('region', { name: 'Tendances à découvrir' });
const favoritesNav = (page: Page) => nav(page).getByRole('button', { name: /^Mes favoris(?: \d+)?$/ });

async function openCatalog(page: Page) {
  await nav(page).getByRole('button', { name: 'Chaînes', exact: true }).click();
  await expect(cards(page).first()).toBeVisible();
  await expect(page).toHaveURL(/\?page=chaines$/);
}

async function expectNoOverflow(page: Page, width: number) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `document overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body, `body overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
}

test.beforeEach(async ({ context, page }) => {
  // Keep discovery deterministic using the authentic shipped catalog. Each test
  // has a fresh browser context, including empty favorites and viewing history.
  await context.route('https://iptv-org.github.io/iptv/index.m3u', route => route.abort());
  // External live playback is verified separately; navigation tests need no
  // dependence on source availability or stream startup timing.
  await context.route(/\.m3u8(?:\?|$)/, route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(trends(page).locator('.home-channel-open').first()).toBeVisible();
});

test('home and catalog fit all supported desktop and mobile widths', async ({ page }, testInfo) => {
  const widths = testInfo.project.name === 'mobile' ? [390, 320] : [1440, 1024, 768];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await nav(page).getByRole('button', { name: 'Accueil', exact: true }).click();
    await expect(homeHeading(page)).toBeVisible();
    await expect(page.locator('.watch-shell')).toBeHidden();
    await expectNoOverflow(page, width);
    await expect(nav(page).getByRole('button', { name: 'Accueil', exact: true })).toBeVisible();
    await expect(favoritesNav(page)).toBeVisible();
    await openCatalog(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Le monde est au programme.' })).toBeVisible();
    await expect(search(page)).toBeVisible();
    await expectNoOverflow(page, width);
  }
});

test('every trend is a genuine catalog channel and opens its own direct page', async ({ page }) => {
  const response = await page.request.get('/catalog.json');
  expect(response.ok()).toBeTruthy();
  const catalog = await response.json() as Catalog;
  const names = await trends(page).locator('.home-card-caption strong').allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(6);
  expect(new Set(names).size).toBe(names.length);
  for (const name of names) {
    const matchingChannels = catalog.channels.filter(item => item.name === name);
    expect(matchingChannels.length, `${name} exists in the real catalog`).toBeGreaterThan(0);
    await trends(page).getByRole('button', { name: `Regarder ${name}`, exact: true }).click();
    await expect(selectedName(page)).toHaveText(name);
    await expect(page).toHaveURL(url => matchingChannels.some(channel => channel.id === url.searchParams.get('chaine') && channel.streams.length > 0));
    await expect(page.locator('.watch-shell')).toBeVisible();
    await page.goBack();
    await expect(homeHeading(page)).toBeVisible();
    await expect(page.locator('.watch-shell')).toBeHidden();
  }
});

test('home category and country shortcuts open matching filters that survive reload', async ({ page }) => {
  await page.getByRole('button', { name: /^Explorer Cinéma, \d+ chaînes$/ }).click();
  await expect(page).toHaveURL(/page=chaines&categorie=Movies/);
  await expect(page.getByRole('combobox', { name: 'Filtrer par catégorie' })).toHaveValue('Movies');
  await expect(cards(page).first()).toBeVisible();
  const catalog = await (await page.request.get('/catalog.json')).json() as Catalog;
  const movieNames = new Set(catalog.channels.filter(channel => channel.categories.includes('Movies')).map(channel => channel.name));
  const names = await cards(page).locator('h3').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(names.every(name => movieNames.has(name))).toBeTruthy();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('combobox', { name: 'Filtrer par catégorie' })).toHaveValue('Movies');
  await page.goBack();
  await expect(homeHeading(page)).toBeVisible();
  await page.getByRole('button', { name: 'Explorer les chaînes : France', exact: true }).click();
  await expect(page).toHaveURL(/page=chaines&pays=FR/);
  await expect(page.getByRole('combobox', { name: 'Filtrer par pays' })).toHaveValue('FR');
  await expect(cards(page).first()).toBeVisible();
});

test('navigation and browser history restore home, catalog filters, favorites, and watch', async ({ page }) => {
  await openCatalog(page);
  await search(page).fill('France 24');
  await expect(page).toHaveURL(/q=France\+24/);
  await favoritesNav(page).click();
  await expect(page).toHaveURL(/\?page=favoris$/);
  await expect(page.getByRole('heading', { name: 'Votre sélection commence ici.' })).toBeVisible();
  await page.goBack();
  await expect(search(page)).toHaveValue('France 24');
  await page.goBack();
  await expect(homeHeading(page)).toBeVisible();
  await page.goForward();
  await expect(search(page)).toHaveValue('France 24');
  await cards(page).getByRole('button', { name: 'Regarder France 24 (Anglais)', exact: true }).click();
  await expect(selectedName(page)).toHaveText('France 24 (Anglais)');
  await expect(page).toHaveURL(url => url.searchParams.get('q') === 'France 24');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(selectedName(page)).toHaveText('France 24 (Anglais)');
  await expect(search(page)).toHaveValue('France 24');
  expect((await cards(page).locator('h3').allTextContents()).every(name => name.includes('France 24'))).toBeTruthy();
  await page.goBack();
  await expect(search(page)).toHaveValue('France 24');
  await expect(page.locator('.watch-shell')).toBeHidden();
  await page.goForward();
  await expect(selectedName(page)).toHaveText('France 24 (Anglais)');
  await expect(search(page)).toHaveValue('France 24');
  await expect(page.locator('.watch-shell')).toBeVisible();
});

test('search ignores accents and recovers from an empty result', async ({ page }) => {
  await openCatalog(page);
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
  await openCatalog(page);
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

test('home favorites persist after reload and remain usable through navigation', async ({ page }) => {
  const card = trends(page).locator('.home-channel-card').first();
  const name = await card.locator('.home-card-caption strong').innerText();
  await card.getByRole('button', { name: `Ajouter ${name} aux favoris`, exact: true }).click();
  await expect(card.getByRole('button', { name: `Retirer ${name} des favoris`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await favoritesNav(page).click();
  await expect(cards(page).locator('h3')).toHaveText([name]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(cards(page).locator('h3')).toHaveText([name]);
  await expect(cards(page).getByRole('button', { name: `Retirer ${name} des favoris`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await openCatalog(page);
  expect(await cards(page).count()).toBeGreaterThan(1);
  await page.locator('#catalogue').getByRole('button', { name: 'Favoris', exact: true }).click();
  await expect(cards(page).locator('h3')).toHaveText([name]);
  await cards(page).getByRole('button', { name: `Retirer ${name} des favoris`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Votre sélection commence ici.' })).toBeVisible();
});

test('a selected channel can be shared and restored by its deep link', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openCatalog(page);
  await search(page).fill('France 24');
  await cards(page).getByRole('button', { name: 'Regarder France 24 (Anglais)', exact: true }).click();
  await expect(selectedName(page)).toHaveText('France 24 (Anglais)');
  await expect(page).toHaveURL(/chaine=France24.fr%40English/);
  await page.getByRole('button', { name: 'Partager cette chaîne' }).click();
  await expect(page.getByText('Lien de la chaîne copié', { exact: true })).toBeVisible();
  const sharedURL = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(sharedURL).searchParams.get('chaine')).toBe('France24.fr@English');
  const sharedPage = await context.newPage();
  await sharedPage.goto(sharedURL, { waitUntil: 'domcontentloaded' });
  await expect(selectedName(sharedPage)).toHaveText('France 24 (Anglais)');
  await expect(sharedPage.locator('.watch-shell')).toBeVisible();
  await sharedPage.close();
});

test('pagination appends channels and searching resets the visible page', async ({ page }) => {
  await openCatalog(page);
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
  await page.getByRole('button', { name: 'Regarder France 24', exact: true }).click();
  const opener = page.getByRole('button', { name: 'À propos de Fréquence', exact: true });
  const before = await selectedName(page).innerText();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBeTruthy();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    // Chromium can tab into browser chrome; focused page elements must remain modal.
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

test('previous zapping wraps to the last filtered channel and next returns to the first', async ({ page }) => {
  await openCatalog(page);
  await search(page).fill('TV5MONDE');
  await expect(cards(page).first()).toBeVisible();
  const names = await cards(page).locator('h3').allTextContents();
  expect(names.length).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Voir plus de chaînes' })).toHaveCount(0);
  await cards(page).first().getByRole('button', { name: `Regarder ${names[0]}`, exact: true }).click();
  await page.getByRole('heading', { name: 'Votre direct.', exact: true }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(selectedName(page)).toHaveText(names.at(-1)!);
  await page.keyboard.press('ArrowRight');
  await expect(selectedName(page)).toHaveText(names[0]);
});

test('the search shortcut opens the catalog and keeps arrow keys inside the search input', async ({ page }) => {
  await homeHeading(page).click();
  await page.keyboard.press('/');
  await expect(search(page)).toBeFocused();
  await expect(page).toHaveURL(/page=chaines/);
  await page.keyboard.type('France');
  await expect(search(page)).toHaveValue('France');
  const before = page.url();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(before);
  await expect(page.locator('.watch-shell')).toBeHidden();
});

test('mini-player keeps the same playing video across navigation and pauses when closed', async ({ page }) => {
  await expect(page.locator('.watch-shell')).toBeHidden();
  await page.goto('/?chaine=France24.fr%40French', { waitUntil: 'domcontentloaded' });
  await expect(selectedName(page)).toHaveText('France 24 (Français)');
  await expect(page.getByRole('button', { name: 'Regarder France 24 (Français) en direct', exact: true })).toBeVisible();
  const video = await page.locator('video').elementHandle();
  expect(video).not.toBeNull();
  // A real browser MediaStream keeps this lifecycle test independent from remote
  // broadcaster availability. The catalog and the player element stay genuine.
  await video!.evaluate(async element => {
    const media = element as HTMLVideoElement;
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext('2d')!;
    const paint = () => { context.fillStyle = `hsl(${Date.now() % 360} 50% 50%)`; context.fillRect(0, 0, 320, 180); };
    paint();
    const timer = window.setInterval(paint, 80);
    (window as Window & { __frequenceMediaFixture?: unknown }).__frequenceMediaFixture = { canvas, timer };
    media.muted = true;
    media.srcObject = canvas.captureStream(12);
    await media.play();
  });
  await expect.poll(() => video!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Mettre en pause', exact: true })).toBeVisible();
  const initialTime = await video!.evaluate(element => (element as HTMLVideoElement).currentTime);
  await nav(page).getByRole('button', { name: 'Accueil', exact: true }).click();
  await expect(homeHeading(page)).toBeVisible();
  await expect(page.locator('.watch-shell.is-mini')).toBeVisible();
  expect(await video!.evaluate(element => element === document.querySelector('video'))).toBeTruthy();
  await expect.poll(() => video!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(initialTime);
  await openCatalog(page);
  await expect(page.locator('.watch-shell.is-mini')).toBeVisible();
  expect(await video!.evaluate(element => (element as HTMLVideoElement).paused)).toBeFalsy();
  await page.getByRole('button', { name: 'Agrandir le lecteur', exact: true }).click();
  await expect(page).toHaveURL(/chaine=France24.fr%40French/);
  await expect(page.locator('.watch-shell')).not.toHaveClass(/is-mini/);
  expect(await video!.evaluate(element => element === document.querySelector('video'))).toBeTruthy();
  await page.goBack();
  await expect(page.locator('.watch-shell.is-mini')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le mini-lecteur', exact: true }).click();
  await expect(page.locator('.watch-shell')).toBeHidden();
  await expect.poll(() => video!.evaluate(element => (element as HTMLVideoElement).paused)).toBeTruthy();
  expect(await video!.evaluate(element => element === document.querySelector('video'))).toBeTruthy();
});
