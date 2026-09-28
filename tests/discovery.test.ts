import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISCOVERY_CATEGORIES, FEATURED_CHANNEL_IDS, getCategoryChannels, getRecentChannels, getTrendingChannels } from '../src/lib/discovery';
import type { Catalog, Channel } from '../src/lib/types';

const channel = (id: string, categories = ['News'], secure = true): Channel => ({
  id, name: id, categories, country: 'FR', languages: ['fra'], logo: '',
  streams: [{ url: `${secure ? 'https' : 'http'}://example.org/${id}.m3u8`, label: id, quality: 'HD' }],
});
const ids = (channels: Channel[]) => channels.map(({ id }) => id);

describe('editorial discovery', () => {
  it('resolves eight real playlist picks spanning the discovery themes', () => {
    const catalog = JSON.parse(readFileSync(new URL('../public/catalog.json', import.meta.url), 'utf8')) as Catalog;
    const picks = getTrendingChannels(catalog.channels);

    expect(picks).toHaveLength(8);
    expect(picks.every(pick => FEATURED_CHANNEL_IDS.includes(pick.id))).toBe(true);
    expect(new Set(picks.flatMap(pick => pick.categories)).size).toBeGreaterThanOrEqual(7);
    expect(picks.every(pick => pick.streams.some(stream => stream.url.startsWith('https://')))).toBe(true);
    expect(DISCOVERY_CATEGORIES.every(category => catalog.channels.some(pick => pick.categories.includes(category.id)))).toBe(true);
  });

  it('fills absent editorial picks from the available catalog, without duplicate cards', () => {
    const available = [channel('local.fr'), channel('TV5MONDEChefs.fr', ['Cooking']), channel('local.fr'), channel('other.ch')];
    expect(ids(getTrendingChannels(available))).toEqual(['TV5MONDEChefs.fr', 'local.fr', 'other.ch']);
  });

  it('puts secure alternatives before HTTP-only picks while keeping each group stable', () => {
    const available = [channel('France24.fr@French', ['News'], false), channel('local-a.fr'), channel('local-b.fr'), channel('TV5MONDEChefs.fr', ['Cooking']), channel('local-http.fr', ['News'], false)];
    expect(ids(getTrendingChannels(available))).toEqual(['TV5MONDEChefs.fr', 'local-a.fr', 'local-b.fr', 'France24.fr@French', 'local-http.fr']);
  });

  it('caps the home selection at eight without modifying channels, streams, or catalog order', () => {
    const available = [channel('http.fr', ['News'], false), ...Array.from({ length: 10 }, (_, index) => channel(`channel-${index}.fr`))];
    const before = structuredClone(available);
    expect(getTrendingChannels(available)).toHaveLength(8);
    expect(getTrendingChannels(available)).toEqual(getTrendingChannels(available));
    expect(available).toEqual(before);
  });
});

describe('category discovery', () => {
  it('matches the category exactly regardless of case and never fills with another category', () => {
    const available = [channel('other.fr', ['Movies']), channel('music-http.fr', ['Music'], false), channel('music-secure.fr', ['Music', 'Culture']), channel('unrelated.fr', ['Music videos'])];
    expect(ids(getCategoryChannels(available, 'music'))).toEqual(['music-secure.fr', 'music-http.fr']);
    expect(getCategoryChannels(available, 'Cooking')).toEqual([]);
  });

  it('prioritizes matching editorial picks and honors the requested limit', () => {
    const available = [channel('local.fr', ['Music']), channel('QwestTV.fr', ['Music']), channel('France24.fr@French', ['News'])];
    expect(ids(getCategoryChannels(available, 'Music', 1))).toEqual(['QwestTV.fr']);
    expect(getCategoryChannels(available, 'Music', 0)).toEqual([]);
    expect(getCategoryChannels(available, 'Music', -1)).toEqual([]);
  });

  it('defaults to eight matching channels and leaves the input intact', () => {
    const available = Array.from({ length: 10 }, (_, index) => channel(`channel-${index}.fr`, ['Music']));
    const before = structuredClone(available);
    expect(ids(getCategoryChannels(available, 'Music'))).toEqual(['channel-0.fr', 'channel-1.fr', 'channel-2.fr', 'channel-3.fr', 'channel-4.fr', 'channel-5.fr', 'channel-6.fr', 'channel-7.fr']);
    expect(available).toEqual(before);
  });
});

describe('recent channels', () => {
  it('keeps history order, removes repeated IDs, and skips channels removed by a refresh', () => {
    const available = [channel('first.fr'), channel('second.fr', ['Music'], false), channel('third.fr')];
    const history = ['second.fr', 'missing.fr', 'first.fr', 'second.fr', 'third.fr'];
    expect(ids(getRecentChannels(available, history))).toEqual(['second.fr', 'first.fr', 'third.fr']);
    expect(history).toEqual(['second.fr', 'missing.fr', 'first.fr', 'second.fr', 'third.fr']);
    expect(ids(available)).toEqual(['first.fr', 'second.fr', 'third.fr']);
  });

  it('returns empty lists when the catalog or history is empty', () => {
    expect(getRecentChannels([], ['missing.fr'])).toEqual([]);
    expect(getRecentChannels([channel('first.fr')], [])).toEqual([]);
    expect(getTrendingChannels([])).toEqual([]);
    expect(getCategoryChannels([], 'News')).toEqual([]);
  });
});
