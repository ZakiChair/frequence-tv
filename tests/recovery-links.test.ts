import { describe, expect, it } from 'vitest';
import { createChannelPlaylist, getChannelDestination, getChannelWebsite, playlistFilename } from '../src/lib/recovery-links';
import type { Channel } from '../src/lib/types';

const channel: Channel = {
  id: 'Tele.ch@French', name: 'Télé Zürich', logo: '', country: 'CH', categories: [], languages: ['fra'],
  website: 'https://example.org/fr/direct?edition=ch',
  streams: [
    { url: 'https://media.example.org/live.m3u8?token=a%2Bb%2Fc&expires=123&key=%0A', label: 'Télé Zürich (HD)', quality: 'HD' },
    { url: 'http://media.example.org/live.mpd?b=2&a=1', label: 'Télé Zürich (SD)', quality: 'SD' },
  ],
};

describe('channel recovery links', () => {
  it.each([
    ['arte.fr', 'https://www.arte.tv/fr/direct/', 'Direct sur ARTE'],
    ['TF1.fr', 'https://www.tf1.fr/tf1/direct', 'Direct sur TF1+'],
    ['M6.fr', 'https://www.m6.fr/m6/direct', 'Direct sur M6+'],
    ['Gulli.fr', 'https://www.m6.fr/gulli/direct', 'Gulli sur M6+'],
    ['CNews.fr', 'https://www.cnews.fr/le-direct', 'Direct sur CNEWS'],
  ])('offers the verified official viewing page for exact channel ID %s', (id, url, label) => {
    expect(getChannelDestination({ ...channel, id })).toEqual({ url, label });
  });

  it('explains account and subscription requirements for Nickelodeon Junior France', () => {
    expect(getChannelDestination({ ...channel, id: 'NickelodeonJunior.fr' })).toEqual({
      url: 'https://www.canalplus.com/chaines/nickelodeon-junior', label: 'Voir sur CANAL+',
      note: 'Compte et abonnement requis ; disponibilité selon votre pays.',
    });
  });

  it.each(['NickelodeonJunior.fr@English', 'Nickelodeon.fr', 'Nickelodeon.us@East', 'NickelodeonJunior.be', 'arte.de', 'TF1.fr@Other', 'tf1.fr', '__proto__', 'constructor'])('does not send the different edition %s to a curated French destination', (id) => {
    expect(getChannelDestination({ ...channel, id })).toEqual({ url: 'https://example.org/fr/direct?edition=ch', label: 'Site de la chaîne' });
    expect(getChannelDestination({ ...channel, id, website: undefined })).toBeUndefined();
  });

  it('never invents a destination for a channel whose website is missing or unsafe', () => {
    expect(getChannelDestination({ ...channel, website: undefined })).toBeUndefined();
    expect(getChannelDestination({ ...channel, website: 'javascript:alert(1)' })).toBeUndefined();
    expect(getChannelDestination({ ...channel, website: 'https://user:secret@example.org/' })).toBeUndefined();
  });

  it('returns the exact supplied channel website without guessing a live page', () => {
    expect(getChannelWebsite(channel)).toBe('https://example.org/fr/direct?edition=ch');
    expect(getChannelWebsite({ ...channel, website: 'http://example.org/' })).toBe('http://example.org/');
    expect(getChannelWebsite({ ...channel, website: undefined })).toBeUndefined();
  });

  it.each([
    'javascript:alert(1)', 'file:///tmp/live.m3u', 'data:text/html,hello', '//example.org/',
    'https://user:secret@example.org/', 'https://user@example.org/', 'https://@example.org/',
    'https://example.org/\r\n#EXTINF:-1,Injected', 'https://example.org/\u2028Injected',
    'https://example.org/\tstream', ' https://example.org/', 'https:\\example.org\\stream',
  ])('rejects unsafe website values: %j', (website) => {
    expect(getChannelWebsite({ ...channel, website })).toBeUndefined();
  });

  it('exports every safe source in order and preserves signed URLs exactly', () => {
    expect(createChannelPlaylist(channel)).toBe('#EXTM3U\n#EXTINF:-1,Télé Zürich (HD)\nhttps://media.example.org/live.m3u8?token=a%2Bb%2Fc&expires=123&key=%0A\n#EXTINF:-1,Télé Zürich (SD)\nhttp://media.example.org/live.mpd?b=2&a=1\n');
  });

  it('prevents source and metadata line injection in an external playlist', () => {
    const playlist = createChannelPlaylist({
      ...channel, name: 'Télé\n#EXTVLCOPT:bad\u2028name', streams: [
        { url: 'https://example.org/\r\nhttps://evil.example/', label: 'Injected URL', quality: '' },
        { url: 'file:///tmp/media', label: 'Local file', quality: '' },
        { url: 'https://user:pass@example.org/private', label: 'Credentials', quality: '' },
        { url: 'https://example.org/good.m3u8', label: 'Télé\r\n#EXTVLCOPT:bad\u0000\u2028name', quality: '' },
        { url: 'https://example.org/fallback.m3u8', label: '   ', quality: '' },
      ],
    });
    expect(playlist).toBe('#EXTM3U\n#EXTINF:-1,Télé #EXTVLCOPT:bad name\nhttps://example.org/good.m3u8\n#EXTINF:-1,Télé #EXTVLCOPT:bad name\nhttps://example.org/fallback.m3u8\n');
    expect(playlist.split('\n').filter((line) => line.startsWith('#'))).toHaveLength(3);
  });

  it('returns only the playlist header when no safe source is available', () => {
    expect(createChannelPlaylist({ ...channel, streams: [{ url: 'javascript:alert(1)', label: '', quality: '' }] })).toBe('#EXTM3U\n');
  });

  it('produces a portable filename while retaining readable Unicode', () => {
    expect(playlistFilename({ ...channel, name: '  Télé   Zürich / 日本  ' })).toBe('Télé-Zürich-日本.m3u');
    expect(playlistFilename({ ...channel, name: '../CON<>:"\\|?*\r\n ' })).toBe('chaine-CON.m3u');
    expect(playlistFilename({ ...channel, name: '  ...  ', id: '' })).toBe('chaine.m3u');
    expect(playlistFilename({ ...channel, name: 'a'.repeat(300) }).length).toBeLessThanOrEqual(104);
  });
});
