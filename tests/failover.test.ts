import { describe, expect, it } from 'vitest';
import { createPlaybackRound, transitionFailure } from '../src/lib/failover';

const streams = [
  { url: 'http://example.org/insecure.m3u8' },
  { url: 'https://example.org/one.m3u8?token=a%2Fb' },
  { url: 'https://example.org/two.mpd' },
  { url: 'https://example.org/one.m3u8?token=a%2Fb' },
  { url: 'javascript:alert(1)' },
  { url: 'https://example.org/three.mp4' },
  { url: 'https://example.org/four.m3u8' },
];

describe('a bounded playback round', () => {
  it('keeps the selected source first, skips insecure and duplicate URLs, and leaves the catalog unchanged', () => {
    const before = structuredClone(streams);
    const round = createPlaybackRound(streams, 2);
    expect(round.sources).toEqual([2, 1, 5]);
    expect(streams).toEqual(before);
  });

  it('never starts a request when a channel has no secure browser source', () => {
    const round = createPlaybackRound([streams[0], streams[4]], 0);
    expect(round.sources).toEqual([]);
    expect(round.stopped).toBe(true);
  });

  it('moves immediately past a permanently unavailable source without retrying it', () => {
    const first = createPlaybackRound(streams, 1);
    const result = transitionFailure(first, 'unavailable', first.token);
    expect(result.action).toBe('next');
    expect(result.round.sources[result.round.position]).toBe(2);
    expect(result.round.position).toBe(1);
  });

  it('tries a transient network problem once, then moves on without revisiting the URL', () => {
    const first = createPlaybackRound(streams, 1);
    const retry = transitionFailure(first, 'network', first.token);
    expect(retry.action).toBe('retry');
    expect(retry.round.position).toBe(0);
    const next = transitionFailure(retry.round, 'network', retry.round.token);
    expect(next.action).toBe('next');
    expect(next.round.position).toBe(1);
    expect(transitionFailure(next.round, 'network', next.round.token).action).toBe('retry');
  });

  it('permits one HLS media recovery and then changes source', () => {
    const first = createPlaybackRound(streams, 1);
    const recovery = transitionFailure(first, 'media', first.token);
    expect(recovery.action).toBe('recover-media');
    const next = transitionFailure(recovery.round, 'media', recovery.round.token);
    expect(next.action).toBe('next');
    expect(next.round.position).toBe(1);
  });

  it('does not reset a source timeout to perform a recovery and stops after three unique sources', () => {
    let round = createPlaybackRound(streams, 1);
    const attempted = [];
    while (!round.stopped) {
      attempted.push(round.sources[round.position]);
      round = transitionFailure(round, 'timeout', round.token).round;
    }
    expect(attempted).toEqual([1, 2, 5]);
    expect(transitionFailure(round, 'network', round.token).action).toBe('ignore');
  });

  it('ignores a failure belonging to an already replaced engine', () => {
    const first = createPlaybackRound(streams, 1);
    const next = transitionFailure(first, 'unavailable', first.token).round;
    const stale = transitionFailure(next, 'unavailable', first.token);
    expect(stale.action).toBe('ignore');
    expect(stale.round).toBe(next);
  });

  it('allows an explicit retry to begin a fresh round after exhaustion', () => {
    const first = createPlaybackRound([streams[1]], 0);
    const stopped = transitionFailure(first, 'timeout', first.token).round;
    expect(stopped.stopped).toBe(true);
    const restarted = createPlaybackRound([streams[1]], 0);
    expect(restarted.stopped).toBe(false);
    expect(transitionFailure(restarted, 'network', restarted.token).action).toBe('retry');
  });
});
