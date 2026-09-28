import { describe, expect, it } from 'vitest';
import { readRoute, routeHref } from '../src/lib/navigation';
import { countryFlag } from '../src/lib/catalog';

describe('navigation between discovery, catalog and playback', () => {
  it('opens home by default and ignores unsupported page names', () => {
    expect(readRoute('').page).toBe('home');
    expect(readRoute('?page=unknown').page).toBe('home');
  });
  it('keeps language feed IDs intact in shareable watch URLs', () => {
    const href = routeHref('watch', { channelId: 'France24.fr@French' });
    expect(href).toBe('/?chaine=France24.fr%40French');
    expect(readRoute(href.slice(1)).channelId).toBe('France24.fr@French');
    expect(readRoute(href.slice(1)).page).toBe('watch');
  });
  it('restores composed catalog filters without introducing a watch route', () => {
    const href = routeHref('channels', { category: 'News', country: 'FR', query: 'France 24 & info' });
    expect(readRoute(href.slice(1))).toEqual({ page: 'channels', channelId: '', category: 'News', country: 'FR', query: 'France 24 & info' });
  });
  it('does not carry watch or catalog parameters onto the homepage', () => {
    expect(routeHref('home', { channelId: 'France24.fr@French', query: 'news', country: 'FR' })).toBe('/');
    expect(routeHref('favorites')).toBe('/?page=favoris');
  });
  it('restores the filtered favorites zapping context on a watch URL', () => {
    const href = routeHref('watch', { channelId: 'France24.fr@French', category: 'News', country: 'FR', query: 'France', favoritesOnly: true });
    expect(readRoute(href.slice(1))).toEqual({ page: 'watch', channelId: 'France24.fr@French', category: 'News', country: 'FR', query: 'France', favoritesOnly: true });
  });
  it('shows the UK flag for the upstream UK country code', () => {
    expect(countryFlag('UK')).toBe('🇬🇧');
    expect(countryFlag('gb')).toBe('🇬🇧');
  });
});
