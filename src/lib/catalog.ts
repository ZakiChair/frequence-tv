import type { Catalog, Channel } from './types';

export const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';

/** Load the shipped snapshot first; the UI can refresh independently without blocking browsing. */
export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  const response = await fetch(`${import.meta.env?.BASE_URL || '/'}catalog.json`, { signal });
  if (!response.ok) throw new Error(`Catalogue indisponible (${response.status}).`);
  const catalog = await response.json() as Catalog;
  if (!Array.isArray(catalog.channels) || !catalog.channels.length) throw new Error('Le catalogue est vide.');
  return catalog;
}

/** Errors deliberately propagate so the UI can keep the currently displayed snapshot. */
export async function refreshCatalog(snapshot?: Catalog, signal?: AbortSignal): Promise<Catalog> {
  const timeout = AbortSignal.timeout(25_000);
  const response = await fetch(PLAYLIST_URL, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`La source ne répond pas (${response.status}).`);
  const channels = parseM3U(await response.text());
  if (!channels.length) throw new Error('La playlist ne contient aucune chaîne lisible.');
  const previous = new Map(snapshot?.channels.map((channel) => [channel.id, channel]));
  for (const channel of channels) {
    const known = previous.get(channel.id);
    if (!known) continue;
    channel.country = known.country || channel.country;
    channel.languages = [...known.languages];
    channel.logo ||= known.logo;
    if (!channel.categories.length) channel.categories = [...known.categories];
  }
  return {
    source: PLAYLIST_URL, updatedAt: new Date().toISOString(), channels,
    streamCount: channels.reduce((count, channel) => count + channel.streams.length, 0),
  };
}

const categories: Record<string, string> = {
  animation: 'Animation', auto: 'Automobile', business: 'Économie', classic: 'Classiques',
  comedy: 'Comédie', cooking: 'Cuisine', culture: 'Culture', documentary: 'Documentaires',
  education: 'Éducation', entertainment: 'Divertissement', family: 'Famille', general: 'Généralistes',
  kids: 'Jeunesse', legislative: 'Parlement', lifestyle: 'Art de vivre', movies: 'Cinéma',
  music: 'Musique', news: 'Actualités', outdoor: 'Nature', relaxation: 'Relaxation',
  religious: 'Religion', science: 'Sciences', series: 'Séries', shop: 'Shopping',
  sports: 'Sport', travel: 'Voyage', weather: 'Météo', xxx: 'Adultes', undefined: 'Autres',
};
const regions = new Intl.DisplayNames(['fr'], { type: 'region' });
const feedLanguages: Record<string, string> = {
  French: 'Français', English: 'Anglais', Arabic: 'Arabe', Spanish: 'Espagnol', Espanol: 'Espagnol',
  Deutsch: 'Allemand', German: 'Allemand', Russian: 'Russe', Portuguese: 'Portugais', Italian: 'Italien',
};

/** Language and regional feeds are distinct channels; resolution variants share their sources. */
export function normalizeChannelId(id: string): string {
  const [base, rawVariant = ''] = id.trim().split('@');
  const variant = rawVariant.replace(/(?:UHD|FHD|HD|SD|[248]K)$/i, '');
  return variant ? `${base}@${variant}` : base;
}

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function categoryName(raw: string): string {
  return categories[raw.toLowerCase()] || raw || 'Autres';
}

export function countryName(code: string): string {
  if (!/^[a-z]{2}$/i.test(code)) return 'International';
  return regions.of(code.toUpperCase()) || code.toUpperCase();
}

export function countryFlag(code: string): string {
  if (!/^[a-z]{2}$/i.test(code)) return '🌐';
  return [...code.toUpperCase()].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? value : '';
  } catch { return ''; }
}

function cleanName(value: string): string {
  return value
    .replace(/\s*\[(?:geo[- ]?blocked|not 24\/7|offline|no signal|test|backup)\]/gi, '')
    .replace(/\s*\((?:\d{3,4}[pi](?:\d{2})?|[248]K|UHD|FHD|HD|SD|geo[- ]?blocked|not 24\/7)\)/gi, '')
    .replace(/\s+(?:UHD|FHD|HD|SD|[248]K)$/i, '')
    .replace(/\s+/g, ' ').trim();
}

function fallbackId(name: string): string {
  // Stable across playlist updates and independent of stream host changes.
  let hash = 2166136261;
  for (const char of normalizeSearch(name)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `channel-${(hash >>> 0).toString(36)}`;
}

function parseInfo(line: string): { attrs: Record<string, string>; label: string } {
  let quoted = false;
  let separator = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === ',' && !quoted) { separator = i; break; }
  }
  const header = separator < 0 ? line : line.slice(0, separator);
  const attrs: Record<string, string> = {};
  for (const match of header.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[match[1].toLowerCase()] = match[2];
  return { attrs, label: separator < 0 ? '' : line.slice(separator + 1).trim() };
}

/** Parse the upstream playlist without losing alternate sources or quality variants. */
export function parseM3U(text: string): Channel[] {
  const channels = new Map<string, Channel>();
  const streamUrls = new Map<string, Set<string>>();
  let entry: ReturnType<typeof parseInfo> | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('#EXTINF:')) { entry = parseInfo(line); continue; }
    if (!line || line.startsWith('#')) continue;
    if (!entry) continue;
    const { attrs, label } = entry;
    entry = undefined;
    const url = safeUrl(line);
    if (!url) continue;
    let name = cleanName(label || attrs['tvg-name'] || attrs['tvg-id'] || 'Chaîne sans nom');
    const sourceId = attrs['tvg-id'] || '';
    const id = normalizeChannelId(sourceId) || fallbackId(name);
    const feed = id.split('@')[1];
    if (feed && feedLanguages[feed]) {
      if (name.toLowerCase().endsWith(` ${feed.toLowerCase()}`)) name = name.slice(0, -feed.length).trim();
      name += ` (${feedLanguages[feed]})`;
    }
    const groups = (attrs['group-title'] || '').split(';').map((group) => group.trim()).filter(Boolean);
    let channel = channels.get(id);
    if (!channel) {
      const country = id.split('@')[0].match(/\.([a-z]{2})$/i)?.[1].toUpperCase() || '';
      channel = { id, name, logo: safeUrl(attrs['tvg-logo'] || ''), country, categories: [], languages: [], streams: [] };
      channels.set(id, channel);
      streamUrls.set(id, new Set());
    }
    if (!channel.logo) channel.logo = safeUrl(attrs['tvg-logo'] || '');
    for (const group of groups) if (!channel.categories.includes(group)) channel.categories.push(group);
    if (streamUrls.get(id)!.has(url)) continue;
    const quality = label.match(/\b(\d{3,4}[pi](?:\d{2})?|[248]K)\b/i)?.[1]
      || label.match(/\b(UHD|FHD|HD|SD)\b/i)?.[1]
      || sourceId.match(/@(UHD|FHD|HD|SD)(?:$|\b)/i)?.[1] || '';
    channel.streams.push({ url, label: label || name, quality });
    streamUrls.get(id)!.add(url);
  }
  return [...channels.values()];
}
