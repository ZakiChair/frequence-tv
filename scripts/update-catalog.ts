import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeChannelId, parseM3U, PLAYLIST_URL } from '../src/lib/catalog';
import { getChannelWebsite } from '../src/lib/recovery-links';
import type { Catalog } from '../src/lib/types';

interface ChannelMetadata { id: string; country: string; categories: string[]; website?: string | null }
interface FeedMetadata { channel: string; id: string; languages: string[] }

async function download(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

// --input uses a previously downloaded copy of the exact index, preserving its fetch timestamp.
const input = process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length);
const playlist = input ? await readFile(input, 'utf8') : await (await download(PLAYLIST_URL)).text();
const updatedAt = input ? (await stat(input)).mtime.toISOString() : new Date().toISOString();
const channels = parseM3U(playlist);
if (!channels.length) throw new Error('Refusing to replace the snapshot with an empty playlist.');

const metadata = await Promise.allSettled([
  download('https://iptv-org.github.io/api/channels.json').then((response) => response.json() as Promise<ChannelMetadata[]>),
  download('https://iptv-org.github.io/api/feeds.json').then((response) => response.json() as Promise<FeedMetadata[]>),
]);
const channelMetadata = new Map(metadata[0].status === 'fulfilled' ? metadata[0].value.map((channel) => [channel.id, channel]) : []);
const representedFeeds = new Set([...playlist.matchAll(/tvg-id="([^"]+)"/g)].map((match) => match[1]));
const languages = new Map<string, Set<string>>();
if (metadata[1].status === 'fulfilled') {
  for (const feed of metadata[1].value) {
    const sourceId = `${feed.channel}@${feed.id}`;
    if (!representedFeeds.has(sourceId)) continue;
    const id = normalizeChannelId(sourceId);
    const existing = languages.get(id) || new Set<string>();
    for (const language of feed.languages) existing.add(language);
    languages.set(id, existing);
  }
}
for (const channel of channels) {
  const info = channelMetadata.get(channel.id.split('@')[0]);
  if (info) {
    channel.country = info.country || channel.country;
    const website = getChannelWebsite({ ...channel, website: info.website ?? undefined });
    if (website) channel.website = website;
    if (!channel.categories.length) channel.categories = info.categories.map((category) => category[0].toUpperCase() + category.slice(1));
  }
  channel.languages = [...(languages.get(channel.id) || [])];
}
for (const result of metadata) if (result.status === 'rejected') console.warn('Optional metadata unavailable:', result.reason);

const catalog: Catalog = {
  source: PLAYLIST_URL, updatedAt, channels,
  streamCount: channels.reduce((total, channel) => total + channel.streams.length, 0),
};
const target = resolve('public/catalog.json');
await writeFile(target, JSON.stringify(catalog));
console.log(`Catalog: ${channels.length} channels / ${catalog.streamCount} streams / ${new Set(channels.map((channel) => channel.country).filter(Boolean)).size} countries`);
console.log(`Source: ${PLAYLIST_URL}\nFetched: ${updatedAt}\nWritten: ${target}`);
