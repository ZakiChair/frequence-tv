import { afterEach, describe, expect, it, vi } from 'vitest';
import { categoryName, countryFlag, countryName, loadCatalog, normalizeSearch, parseM3U, refreshCatalog } from '../src/lib/catalog';
import type { Catalog } from '../src/lib/types';

afterEach(() => vi.unstubAllGlobals());

describe('parseM3U', () => {
  it('keeps language feeds separate while merging quality variants of one language', () => {
    const channels = parseM3U(`#EXTM3U
#EXTINF:-1 tvg-id="France24.fr@French",France 24 (1080p)
https://example.org/french.m3u8
#EXTINF:-1 tvg-id="France24.fr@English",France 24 English (720p)
https://example.org/english.m3u8
#EXTINF:-1 tvg-id="France24.fr@EnglishHD",France 24 English HD (1080p)
https://example.org/english-hd.m3u8`);
    expect(channels.map(({ id, country }) => ({ id, country }))).toEqual([
      { id: 'France24.fr@French', country: 'FR' }, { id: 'France24.fr@English', country: 'FR' },
    ]);
    expect(channels[0].name).toBe('France 24 (Français)');
    expect(channels[1].streams).toHaveLength(2);
  });

  it('groups channel variants, retains distinct streams, and deduplicates repeated URLs', () => {
    const channels = parseM3U(`#EXTM3U
#EXTINF:-1 tvg-id="France24.fr@SD" tvg-logo="https://example.org/france.png" group-title="News",France 24 (480p) [Geo-blocked]
https://example.org/sd.m3u8
#EXTINF:-1 tvg-id="France24.fr@HD" group-title="News;General",France 24 HD (1080p)
#EXTVLCOPT:http-referrer=https://example.org/
https://example.org/hd.m3u8
#EXTINF:-1 tvg-id="France24.fr@HD",France 24 HD (1080p)
https://example.org/hd.m3u8`);
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({
      id: 'France24.fr', name: 'France 24', country: 'FR',
      logo: 'https://example.org/france.png', categories: ['News', 'General'],
      streams: [
        { url: 'https://example.org/sd.m3u8', quality: '480p' },
        { url: 'https://example.org/hd.m3u8', quality: '1080p' },
      ],
    });
  });

  it('handles quoted commas, CRLF, missing identifiers, and legitimate parentheses', () => {
    const channels = parseM3U('\uFEFF#EXTM3U\r\n#EXTINF:-1 tvg-id="" group-title="Culture, Arts;Music",Café TV (Paris) (720p)\r\nhttps://example.org/cafe.m3u8\r\n#EXTINF:-1 group-title="Music",Café TV (Paris) HD (1080p)\r\nhttps://example.org/cafe-hd.m3u8');
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('Café TV (Paris)');
    expect(channels[0].categories).toEqual(['Culture, Arts', 'Music']);
    expect(channels[0].streams).toHaveLength(2);
    expect(channels[0].country).toBe('');
  });

  it('rejects unsafe stream and logo schemes without consuming the next entry', () => {
    const channels = parseM3U(`#EXTM3U
#EXTINF:-1 tvg-id="Bad.fr@SD",Bad
javascript:alert(1)
#EXTINF:-1 tvg-id="Good.ch@SD" tvg-logo="javascript:alert(1)",Good
https://example.org/good.m3u8
#EXTINF:-1 tvg-id="Local.fr@SD",Local
file:///etc/passwd
#EXTINF:-1 tvg-id="Http.be@SD",HTTP
http://example.org/live.m3u8`);
    expect(channels.map((channel) => channel.id)).toEqual(['Good.ch', 'Http.be']);
    expect(channels[0].logo).toBe('');
  });
});

describe('catalog loading', () => {
  const snapshot: Catalog = {
    source: 'https://iptv-org.github.io/iptv/index.m3u', updatedAt: '2026-09-28T08:00:00Z', streamCount: 1,
    channels: [{ id: 'France24.fr', name: 'France 24', country: 'FR', categories: ['News'], languages: ['fra'], logo: 'https://example.org/logo.png', streams: [{ url: 'https://example.org/old.m3u8', label: 'France 24', quality: 'HD' }] }],
  };

  it('loads the bundled catalog for an immediate usable result', async () => {
    vi.stubGlobal('fetch', async (input: string) => {
      if (input !== '/catalog.json') throw new Error('Unexpected catalog URL');
      return new Response(JSON.stringify(snapshot), { status: 200 });
    });
    expect(await loadCatalog()).toEqual(snapshot);
  });

  it('refreshes from the exact playlist and retains metadata with new streams', async () => {
    vi.stubGlobal('fetch', async (input: string) => {
      if (input !== 'https://iptv-org.github.io/iptv/index.m3u') throw new Error('Wrong source');
      return new Response('#EXTM3U\n#EXTINF:-1 tvg-id="France24.fr@HD" group-title="News",France 24 (1080p)\nhttps://example.org/new.m3u8', { status: 200 });
    });
    const updated = await refreshCatalog(snapshot);
    expect(updated.source).toBe(snapshot.source);
    expect(updated.streamCount).toBe(1);
    expect(updated.channels[0]).toMatchObject({ languages: ['fra'], logo: 'https://example.org/logo.png', streams: [{ url: 'https://example.org/new.m3u8' }] });
    expect(updated.updatedAt).not.toBe(snapshot.updatedAt);
    expect(snapshot.channels[0].streams[0].url).toBe('https://example.org/old.m3u8');
  });

  it('rejects invalid live responses so callers keep their last working catalog', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Temporarily unavailable</html>', { status: 200 }));
    await expect(refreshCatalog(snapshot)).rejects.toThrow('La playlist ne contient aucune chaîne lisible.');
  });
});

describe('French catalog display helpers', () => {
  it('localizes known categories and countries with readable unknown fallbacks', () => {
    expect(categoryName('News')).toBe('Actualités');
    expect(categoryName('Experimental')).toBe('Experimental');
    expect(countryName('FR')).toBe('France');
    expect(countryName('')).toBe('International');
    expect(countryFlag('ch')).toBe('🇨🇭');
    expect(countryFlag('')).toBe('🌐');
  });

  it('matches accents, case, and redundant spacing consistently', () => {
    expect(normalizeSearch('  TÉLÉ   Québec ')).toBe('tele quebec');
  });
});
