import type { Channel } from './types';

// Editorial picks from the public playlist, not audience or popularity rankings.
export const FEATURED_CHANNEL_IDS: readonly string[] = [
  'France24.fr@French',
  'TV5MONDEChefs.fr',
  'QwestTV.fr',
  'WaterBear.ch',
  'RedBullTV.at',
  'SonyOneHitsAction.fr',
  'DW.de@English',
  'KiKA.de',
];

export const DISCOVERY_CATEGORIES: readonly { id: string; label: string; description: string }[] = [
  { id: 'News', label: 'Actualités', description: 'Le monde, en direct.' },
  { id: 'Movies', label: 'Cinéma', description: 'Une autre histoire à découvrir.' },
  { id: 'Music', label: 'Musique', description: 'Trouvez votre rythme.' },
  { id: 'Sports', label: 'Sport', description: 'Au plus près de l’action.' },
  { id: 'Cooking', label: 'Cuisine', description: 'Le goût de la découverte.' },
  { id: 'Documentary', label: 'Documentaires', description: 'Ouvrez de nouveaux horizons.' },
  { id: 'Kids', label: 'Jeunesse', description: 'Un monde à imaginer.' },
];

function editorialOrder(channels: readonly Channel[]): Channel[] {
  const candidates = [...getRecentChannels(channels, FEATURED_CHANNEL_IDS), ...channels];
  const seen = new Set<string>();
  const secure: Channel[] = [];
  const remaining: Channel[] = [];

  for (const channel of candidates) {
    if (seen.has(channel.id)) continue;
    seen.add(channel.id);
    const hasSecureSource = channel.streams.some(stream => /^https:\/\//i.test(stream.url));
    (hasSecureSource ? secure : remaining).push(channel);
  }

  return [...secure, ...remaining];
}

export function getTrendingChannels(channels: readonly Channel[]): Channel[] {
  return editorialOrder(channels).slice(0, 8);
}

export function getCategoryChannels(channels: readonly Channel[], category: string, limit = 8): Channel[] {
  const categoryId = category.toLowerCase();
  const matching = channels.filter(channel => channel.categories.some(value => value.toLowerCase() === categoryId));
  return editorialOrder(matching).slice(0, Math.max(0, limit));
}

export function getRecentChannels(channels: readonly Channel[], ids: readonly string[]): Channel[] {
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  const recent: Channel[] = [];
  for (const id of new Set(ids)) {
    const channel = byId.get(id);
    if (channel) recent.push(channel);
  }
  return recent;
}
