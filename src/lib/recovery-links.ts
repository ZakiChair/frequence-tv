import type { Channel } from './types';

/** Keep original bytes, including signed queries, while rejecting ambiguous or injectable URLs. */
function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value)) return undefined;
  try {
    const parsed = new URL(value);
    const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0];
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || authority.includes('@')) return undefined;
    return value;
  } catch { return undefined; }
}

export function getChannelWebsite(channel: Channel): string | undefined {
  return safeHttpUrl(channel.website);
}

type ChannelDestination = { url: string; label: string; note?: string };

// Exact editions only. Verification sources and access conditions: docs/fallback-sources.md.
const viewingPages = new Map<string, ChannelDestination>([
  ['arte.fr', { url: 'https://www.arte.tv/fr/direct/', label: 'Direct sur ARTE' }],
  ['TF1.fr', { url: 'https://www.tf1.fr/tf1/direct', label: 'Direct sur TF1+' }],
  ['M6.fr', { url: 'https://www.m6.fr/m6/direct', label: 'Direct sur M6+' }],
  ['Gulli.fr', { url: 'https://www.m6.fr/gulli/direct', label: 'Gulli sur M6+' }],
  ['CNews.fr', { url: 'https://www.cnews.fr/le-direct', label: 'Direct sur CNEWS' }],
  ['NickelodeonJunior.fr', {
    url: 'https://www.canalplus.com/chaines/nickelodeon-junior', label: 'Voir sur CANAL+',
    note: 'Compte et abonnement requis ; disponibilité selon votre pays.',
  }],
]);

export function getChannelDestination(channel: Channel): ChannelDestination | undefined {
  const verifiedPage = viewingPages.get(channel.id);
  if (verifiedPage) return verifiedPage;
  const website = getChannelWebsite(channel);
  return website ? { url: website, label: 'Site de la chaîne' } : undefined;
}

function playlistLabel(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A standard playlist can be opened by VLC and other external players. */
export function createChannelPlaylist(channel: Channel): string {
  const lines = ['#EXTM3U'];
  for (const stream of channel.streams) {
    const url = safeHttpUrl(stream.url);
    if (!url) continue;
    const label = playlistLabel(stream.label) || playlistLabel(channel.name) || 'Chaîne';
    lines.push(`#EXTINF:-1,${label}`, url);
  }
  return `${lines.join('\n')}\n`;
}

export function playlistFilename(channel: Channel): string {
  const clean = (value: string) => value.normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '-')
    .replace(/[\s-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  // Sixty Unicode characters fit common filesystem byte limits, including the extension.
  let name = Array.from(clean(channel.name) || clean(channel.id) || 'chaine').slice(0, 60).join('');
  name = name.replace(/[.-]+$/g, '');
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `chaine-${name}`;
  return `${name}.m3u`;
}
