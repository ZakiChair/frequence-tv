/** A round is restricted to three distinct secure URLs from this channel. */
export const SOURCE_TIMEOUT_MS = 9_000;
const MAX_SOURCES = 3;

export type PlaybackFailure = 'network' | 'media' | 'timeout' | 'unavailable';
export type PlaybackRound = {
  sources: number[];
  position: number;
  token: number;
  networkRetried: boolean;
  mediaRecovered: boolean;
  stopped: boolean;
};

export function createPlaybackRound(streams: readonly { url: string }[], chosen: number): PlaybackRound {
  const seen = new Set<string>();
  const sources = [chosen, ...streams.map((_, index) => index)].filter(index => {
    const url = streams[index]?.url;
    if (!url || seen.has(url)) return false;
    try { if (new URL(url).protocol !== 'https:') return false; }
    catch { return false; }
    seen.add(url);
    return true;
  }).slice(0, MAX_SOURCES);
  return { sources, position: 0, token: 0, networkRetried: false, mediaRecovered: false, stopped: sources.length === 0 };
}

export function transitionFailure(round: PlaybackRound, failure: PlaybackFailure, token: number): {
  round: PlaybackRound;
  action: 'ignore' | 'retry' | 'recover-media' | 'next' | 'stop';
} {
  if (round.stopped || token !== round.token) return { round, action: 'ignore' };
  if (failure === 'network' && !round.networkRetried) {
    return { round: { ...round, token: round.token + 1, networkRetried: true }, action: 'retry' };
  }
  if (failure === 'media' && !round.mediaRecovered) {
    return { round: { ...round, mediaRecovered: true }, action: 'recover-media' };
  }
  if (round.position + 1 >= round.sources.length) {
    return { round: { ...round, token: round.token + 1, stopped: true }, action: 'stop' };
  }
  return {
    round: { ...round, position: round.position + 1, token: round.token + 1, networkRetried: false, mediaRecovered: false },
    action: 'next',
  };
}
