import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Route } from '@playwright/test';
import type { Catalog, Channel } from '../src/lib/types';

const mediaOrigin = 'https://media.frequence.test';
const playlistURL = 'https://iptv-org.github.io/iptv/index.m3u';
const fixturePath = (path: string) => fileURLToPath(new URL(`./fixtures/${path}`, import.meta.url));
const source = (path: string, label = path) => ({ url: `${mediaOrigin}/${path}`, label, quality: '' });
const makeChannel = (id: string, streams: Channel['streams'], website = 'https://official.frequence.test/watch'): Channel => ({
  id, name: `Fixture ${id}`, country: 'FR', categories: ['News'], languages: ['fra'], logo: '', streams, website,
});
const sourceSelect = (page: Page) => page.getByRole('combobox', { name: 'Source du direct', exact: true });
const playerStatus = (page: Page) => page.locator('.tv-player__toolbar-status');
const playerError = (page: Page) => page.locator('.tv-player__error');
type ResponseKind = 'hls' | 'dash' | 'video' | 'stall' | number;

async function fixturePlayer(page: Page, channels: Channel[], responses: Record<string, ResponseKind>) {
  const requested: string[] = [];
  const pending = new Map<string, Route[]>();
  const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  const catalog: Catalog = {
    updatedAt: '2026-09-01T00:00:00.000Z', source: playlistURL,
    streamCount: channels.reduce((count, channel) => count + channel.streams.length, 0), channels,
  };
  await page.clock.install();
  await page.route('**/catalog.json', route => route.fulfill({ json: catalog }));
  await page.route(playlistURL, route => route.abort());
  await page.route(`${mediaOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    const kind = responses[name];
    if (kind !== undefined) requested.push(name);
    if (kind === 'stall') {
      pending.set(name, [...(pending.get(name) ?? []), route]);
      return;
    }
    if (typeof kind === 'number' || kind === undefined && !/^(init\.mp4|playlist0\.m4s|(?:init|chunk)-stream.*\.m4s)$/.test(name)) {
      await route.fulfill({ status: typeof kind === 'number' ? kind : 404, body: 'Unavailable fixture', headers });
      return;
    }
    const path = kind === 'hls' ? 'hls/playlist.m3u8'
      : kind === 'dash' ? 'dash/manifest.mpd'
      : kind === 'video' ? 'video.mp4'
      : /^(init\.mp4|playlist0\.m4s)$/.test(name) ? `hls/${name}` : `dash/${name}`;
    await route.fulfill({
      path: fixturePath(path), headers,
      contentType: kind === 'hls' ? 'application/vnd.apple.mpegurl' : kind === 'dash' ? 'application/dash+xml' : 'video/mp4',
    });
  });
  await page.goto(`/?chaine=${encodeURIComponent(channels[0].id)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.now-name h2')).toHaveText(channels[0].name);
  return {
    requested, pending,
    start: () => page.getByRole('button', { name: `Regarder ${channels[0].name} en direct`, exact: true }).click(),
  };
}

async function expectPlaying(page: Page) {
  await expect(playerStatus(page)).toHaveText('En direct');
  await expect.poll(() => page.locator('video').evaluate(element => {
    const video = element as HTMLVideoElement;
    return !video.paused && video.readyState >= 2;
  })).toBeTruthy();
  await expect.poll(() => page.locator('video').evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
}

test('a missing HLS source falls back to a decoded source of the same channel', async ({ page }) => {
  const channel = makeChannel('Alpha.fr@French', [source('missing.m3u8'), source('working.m3u8')]);
  const fixture = await fixturePlayer(page, [channel, makeChannel('Alpha.fr@English', [source('other-edition.m3u8')])], {
    'missing.m3u8': 404, 'working.m3u8': 'hls', 'other-edition.m3u8': 'hls',
  });
  await fixture.start();
  await expectPlaying(page);
  await expect(sourceSelect(page)).toHaveValue('1');
  await expect(page.locator('.now-name h2')).toHaveText(channel.name);
  await expect(page).toHaveURL(url => url.searchParams.get('chaine') === channel.id);
  expect(fixture.requested).toEqual(['missing.m3u8', 'working.m3u8']);
  await expect(page.locator('video')).toHaveCount(1);
});

test('exhaustion is bounded, does not cycle, and retry begins a new round', async ({ page }) => {
  const streams = ['one.m3u8', 'two.m3u8', 'three.m3u8', 'four.m3u8'].map(path => source(path));
  const fixture = await fixturePlayer(page, [makeChannel('Bounded.fr', streams)], Object.fromEntries(streams.map(stream => [new URL(stream.url).pathname.slice(1), 404])));
  await fixture.start();
  await expect(playerError(page)).toBeVisible();
  expect(fixture.requested).toEqual(['one.m3u8', 'two.m3u8', 'three.m3u8']);
  await page.clock.fastForward(60_000);
  await expect(playerError(page)).toBeVisible();
  expect(fixture.requested).toHaveLength(3);
  await playerError(page).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect.poll(() => fixture.requested.length).toBe(6);
  expect(fixture.requested.slice(3)).toEqual(['one.m3u8', 'two.m3u8', 'three.m3u8']);
  await expect(playerError(page)).toBeVisible();
});

test('a source that never responds reaches its deadline and falls back', async ({ page }) => {
  const fixture = await fixturePlayer(page, [makeChannel('Timeout.fr', [source('stalled.m3u8'), source('after-timeout.m3u8')])], {
    'stalled.m3u8': 'stall', 'after-timeout.m3u8': 'hls',
  });
  await fixture.start();
  await expect.poll(() => fixture.requested).toEqual(['stalled.m3u8']);
  await page.clock.fastForward(9_500);
  await expectPlaying(page);
  await expect(sourceSelect(page)).toHaveValue('1');
  expect(fixture.requested).toEqual(['stalled.m3u8', 'after-timeout.m3u8']);
});

test('a recoverable network error retries once before using the next source', async ({ page }) => {
  const fixture = await fixturePlayer(page, [makeChannel('Retry.fr', [source('retry.m3u8'), source('after-retry.m3u8')])], {
    'retry.m3u8': 503, 'after-retry.m3u8': 'hls',
  });
  await fixture.start();
  await expectPlaying(page);
  expect(fixture.requested).toEqual(['retry.m3u8', 'retry.m3u8', 'after-retry.m3u8']);
});

test('three unresponsive sources stop within three deadlines', async ({ page }) => {
  const streams = ['slow-one.m3u8', 'slow-two.m3u8', 'slow-three.m3u8', 'slow-four.m3u8'].map(path => source(path));
  const fixture = await fixturePlayer(page, [makeChannel('Slow.fr', streams)], Object.fromEntries(streams.map(stream => [new URL(stream.url).pathname.slice(1), 'stall' as const])));
  await fixture.start();
  for (let count = 1; count <= 3; count += 1) {
    await expect.poll(() => fixture.requested.length).toBe(count);
    await page.clock.fastForward(9_001);
  }
  await expect(playerError(page)).toBeVisible();
  expect(fixture.requested).toEqual(['slow-one.m3u8', 'slow-two.m3u8', 'slow-three.m3u8']);
  await page.clock.fastForward(60_000);
  expect(fixture.requested).toHaveLength(3);
});

test('manual source selection starts a fresh round and a new channel resets the choice', async ({ page }) => {
  const alpha = makeChannel('Alpha.fr', [source('alpha-first.m3u8'), source('alpha-second.m3u8')]);
  const beta = makeChannel('Beta.fr', [source('beta-first.mp4'), source('beta-second.mp4')]);
  const fixture = await fixturePlayer(page, [alpha, beta], {
    'alpha-first.m3u8': 404, 'alpha-second.m3u8': 'hls', 'beta-first.mp4': 'video', 'beta-second.mp4': 'video',
  });
  await fixture.start();
  await expectPlaying(page);
  await sourceSelect(page).selectOption('0');
  await expect.poll(() => fixture.requested.filter(path => path === 'alpha-first.m3u8').length).toBe(2);
  await expectPlaying(page);
  await expect(sourceSelect(page)).toHaveValue('1');
  await page.locator('.discovery').getByRole('button', { name: new RegExp(beta.name) }).click();
  await expectPlaying(page);
  await expect(sourceSelect(page)).toHaveValue('0');
  expect(fixture.requested.at(-1)).toBe('beta-first.mp4');
  await page.locator('.discovery').getByRole('button', { name: new RegExp(alpha.name) }).click();
  await expect.poll(() => fixture.requested.filter(path => path === 'alpha-first.m3u8').length).toBe(3);
  await expectPlaying(page);
});

test('native pause cancels a waiting deadline until playback resumes', async ({ page }) => {
  const fixture = await fixturePlayer(page, [makeChannel('Paused.fr', [source('paused.mp4'), source('unused.mp4')])], {
    'paused.mp4': 'video', 'unused.mp4': 'video',
  });
  await fixture.start();
  await expectPlaying(page);
  // A waiting event is a browser event; an explicit native pause must cancel
  // any recovery timer it armed and retain the chosen source.
  await page.locator('video').evaluate(element => { const video = element as HTMLVideoElement; video.dispatchEvent(new Event('waiting')); video.pause(); });
  await expect(playerStatus(page)).toHaveText('En pause');
  await page.clock.fastForward(60_000);
  await expect(playerStatus(page)).toHaveText('En pause');
  expect(fixture.requested).toEqual(['paused.mp4']);
  await page.getByRole('button', { name: 'Lancer la lecture', exact: true }).click();
  await expectPlaying(page);
});

test('a catalog source update preserves native pause until the user resumes', async ({ page }) => {
  const channel = makeChannel('PausedRefresh.fr', [source('paused-refresh.mp4')]);
  const fixture = await fixturePlayer(page, [channel], { 'paused-refresh.mp4': 'video', 'added-source.mp4': 'video' });
  await fixture.start();
  await expectPlaying(page);
  await page.locator('video').evaluate(element => (element as HTMLVideoElement).pause());
  await expect(playerStatus(page)).toHaveText('En pause');
  await page.route(playlistURL, route => route.fulfill({
    body: `#EXTM3U\n#EXTINF:-1 tvg-id="${channel.id}",${channel.name}\n${mediaOrigin}/paused-refresh.mp4\n#EXTINF:-1 tvg-id="${channel.id}",${channel.name}\n${mediaOrigin}/added-source.mp4\n`,
    contentType: 'application/vnd.apple.mpegurl', headers: { 'access-control-allow-origin': '*' },
  }));
  await page.getByRole('button', { name: 'Actualiser le catalogue', exact: true }).click();
  await expect(sourceSelect(page).locator('option')).toHaveCount(2);
  await expect(playerStatus(page)).toHaveText('En pause');
  await page.clock.fastForward(30_000);
  await expect(playerStatus(page)).toHaveText('En pause');
  expect(fixture.requested).toEqual(['paused-refresh.mp4']);
  await page.getByRole('button', { name: 'Lancer la lecture', exact: true }).click();
  await expectPlaying(page);
  expect(fixture.requested).not.toContain('added-source.mp4');
});

test('closing the mini-player cancels pending attempts and keeps the single video stopped', async ({ page }) => {
  const fixture = await fixturePlayer(page, [makeChannel('Closed.fr', [source('before-close.mp4'), source('pending-close.m3u8')])], {
    'before-close.mp4': 'video', 'pending-close.m3u8': 'stall',
  });
  await fixture.start();
  await expectPlaying(page);
  const video = await page.locator('video').elementHandle();
  await sourceSelect(page).selectOption('1');
  await expect.poll(() => fixture.pending.has('pending-close.m3u8')).toBeTruthy();
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Accueil', exact: true }).click();
  await expect(page.locator('.watch-shell.is-mini')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le mini-lecteur', exact: true }).click();
  await expect(page.locator('.watch-shell')).toBeHidden();
  await page.clock.fastForward(60_000);
  for (const route of fixture.pending.get('pending-close.m3u8') ?? []) await route.fulfill({ status: 404, body: 'Late response' }).catch(() => {});
  await expect.poll(() => video!.evaluate(element => (element as HTMLVideoElement).paused)).toBeTruthy();
  expect(await video!.evaluate(element => element === document.querySelector('video'))).toBeTruthy();
  expect(fixture.requested).toEqual(['before-close.mp4', 'pending-close.m3u8']);
  await expect(page.locator('video')).toHaveCount(1);
});

test('a late previous-channel response cannot advance the new channel', async ({ page }) => {
  const alpha = makeChannel('Old.fr', [source('old-pending.m3u8'), source('old-unused.m3u8')]);
  const beta = makeChannel('New.fr', [source('new-current.mp4'), source('new-unused.mp4')]);
  const fixture = await fixturePlayer(page, [alpha, beta], {
    'old-pending.m3u8': 'stall', 'old-unused.m3u8': 'hls', 'new-current.mp4': 'video', 'new-unused.mp4': 'video',
  });
  await fixture.start();
  await expect.poll(() => fixture.pending.has('old-pending.m3u8')).toBeTruthy();
  await page.locator('.discovery').getByRole('button', { name: new RegExp(beta.name) }).click();
  await expectPlaying(page);
  for (const route of fixture.pending.get('old-pending.m3u8') ?? []) await route.fulfill({ status: 404, body: 'Late response' }).catch(() => {});
  await page.clock.fastForward(30_000);
  await expect(page.locator('.now-name h2')).toHaveText(beta.name);
  await expect(sourceSelect(page)).toHaveValue('0');
  await expectPlaying(page);
  expect(fixture.requested).toEqual(['old-pending.m3u8', 'new-current.mp4']);
});

test('DASH manifests play through the DASH engine with local media', async ({ page }) => {
  const fixture = await fixturePlayer(page, [makeChannel('Dash.fr', [source('direct.mpd')])], { 'direct.mpd': 'dash' });
  await fixture.start();
  await expectPlaying(page);
  expect(fixture.requested).toEqual(['direct.mpd']);
  await expect(page.locator('video')).toHaveCount(1);
});

test('final errors offer a safe official website and a real downloadable M3U', async ({ page }) => {
  const channel = makeChannel('External.fr', [source('external.m3u8')]);
  const fixture = await fixturePlayer(page, [channel], { 'external.m3u8': 404 });
  await fixture.start();
  await expect(playerError(page)).toBeVisible();
  const official = playerError(page).getByRole('link', { name: /site de la chaîne/i });
  await expect(official).toHaveAttribute('href', 'https://official.frequence.test/watch');
  await expect(official).toHaveAttribute('target', '_blank');
  await expect(official).toHaveAttribute('rel', /noopener/);
  const downloadPromise = page.waitForEvent('download');
  await playerError(page).getByRole('button', { name: /VLC|M3U/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.m3u$/);
  const content = await readFile((await download.path())!, 'utf8');
  expect(content).toMatch(/^#EXTM3U\r?\n/);
  expect(content).toContain(`#EXTINF:-1,${channel.streams[0].label}`);
  expect(content).toContain(channel.streams[0].url);
  expect(content.split(/\r?\n/).filter(line => line && !line.startsWith('#'))).toEqual([channel.streams[0].url]);
});

test('catalog refresh from the final error restarts playback with the new channel source', async ({ page }) => {
  const channel = makeChannel('Refresh.fr', [source('outdated.m3u8')]);
  const fixture = await fixturePlayer(page, [channel], { 'outdated.m3u8': 404, 'refreshed.m3u8': 'hls' });
  await fixture.start();
  await expect(playerError(page)).toBeVisible();
  await page.route(playlistURL, route => route.fulfill({
    body: `#EXTM3U\n#EXTINF:-1 tvg-id="${channel.id}" group-title="News",${channel.name}\n${mediaOrigin}/refreshed.m3u8\n`,
    contentType: 'application/vnd.apple.mpegurl', headers: { 'access-control-allow-origin': '*' },
  }));
  await playerError(page).getByRole('button', { name: /actualiser/i }).click();
  await expectPlaying(page);
  await expect(page.locator('.now-name h2')).toHaveText(channel.name);
  expect(fixture.requested).toEqual(['outdated.m3u8', 'refreshed.m3u8']);
});

test('refresh that removes the selected channel preserves it instead of switching channels', async ({ page }) => {
  const channel = makeChannel('Removed.fr', [source('removed.m3u8')]);
  const fixture = await fixturePlayer(page, [channel], { 'removed.m3u8': 404, 'unrelated.m3u8': 'hls' });
  await fixture.start();
  await expect(playerError(page)).toBeVisible();
  await page.route(playlistURL, route => route.fulfill({
    body: `#EXTM3U\n#EXTINF:-1 tvg-id="France24.fr@French" group-title="News",Unrelated channel\n${mediaOrigin}/unrelated.m3u8\n`,
    contentType: 'application/vnd.apple.mpegurl', headers: { 'access-control-allow-origin': '*' },
  }));
  await playerError(page).getByRole('button', { name: /actualiser/i }).click();
  await expect(page.locator('.tv-player__notice')).toHaveText(/ne figure plus dans la playlist/i);
  await expect(playerError(page)).toBeVisible();
  await expect(page.locator('.now-name h2')).toHaveText(channel.name);
  await expect(page).toHaveURL(url => url.searchParams.get('chaine') === channel.id);
  expect(fixture.requested).not.toContain('unrelated.m3u8');
  await page.clock.fastForward(60_000);
  await expect(page.locator('.now-name h2')).toHaveText(channel.name);
  expect(fixture.requested).not.toContain('unrelated.m3u8');
});

test('an unsafe official-site URL never becomes a clickable error action', async ({ page }) => {
  const channel = makeChannel('Unsafe.fr', [source('unsafe.m3u8')], 'javascript:alert(document.domain)');
  const fixture = await fixturePlayer(page, [channel], { 'unsafe.m3u8': 404 });
  await fixture.start();
  await expect(playerError(page)).toBeVisible();
  await expect(playerError(page).getByRole('link', { name: /site de la chaîne/i })).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test('HTTP-only Nickelodeon Junior offers CANAL+ and preserves its original VLC URL', async ({ page }) => {
  const originalURL = 'http://media.frequence.test/nickelodeon-junior.m3u8?token=original%2Fvalue';
  const channel = makeChannel('NickelodeonJunior.fr', [{ url: originalURL, label: 'Nickelodeon Junior', quality: '' }]);
  channel.name = 'Nickelodeon Junior';
  const mediaRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).hostname === 'media.frequence.test') mediaRequests.push(request.url());
  });
  await page.route('http://media.frequence.test/**', route => route.abort());
  const fixture = await fixturePlayer(page, [channel], {});
  await fixture.start();
  await expect(playerError(page)).toBeVisible({ timeout: 1_000 });
  await expect(playerStatus(page)).toHaveText('Source indisponible');
  await expect(playerError(page)).toContainText('HTTP');
  const official = playerError(page).getByRole('link', { name: 'Voir sur CANAL+', exact: true });
  await expect(official).toHaveAttribute('href', 'https://www.canalplus.com/chaines/nickelodeon-junior');
  await expect(official).toHaveAttribute('target', '_blank');
  await expect(official).toHaveAttribute('rel', /noopener/);
  await expect(playerError(page)).toContainText('Compte et abonnement requis ; disponibilité selon votre pays.');
  const downloadPromise = page.waitForEvent('download');
  await playerError(page).getByRole('button', { name: 'Télécharger pour VLC', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.m3u$/);
  const content = await readFile((await download.path())!, 'utf8');
  expect(content).toMatch(/^#EXTM3U\r?\n/);
  expect(content.split(/\r?\n/).filter(line => line && !line.startsWith('#'))).toEqual([originalURL]);
  await page.clock.fastForward(60_000);
  expect(mediaRequests).toEqual([]);
  await expect(page.locator('.now-name h2')).toHaveText(channel.name);
});
