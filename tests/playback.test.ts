import { describe, expect, it } from 'vitest';
import { isDirectVideo, isWebStream, preferredStreamIndex, streamProblem } from '../src/lib/playback';

describe('browser stream compatibility', () => {
  it('starts with the first secure source while preserving catalog order and falling back to HTTP if necessary', () => {
    const sources = [{ url: 'http://example.org/live.m3u8' }, { url: 'https://example.org/live.m3u8' }];
    expect(preferredStreamIndex(sources)).toBe(1);
    expect(sources[0].url).toBe('http://example.org/live.m3u8');
    expect(preferredStreamIndex([sources[0]])).toBe(0);
    expect(preferredStreamIndex([])).toBe(0);
  });
  it('explains why an HTTP source cannot play on a secure page while keeping its external link available', () => {
    const url = 'http://example.org/live.m3u8';
    expect(streamProblem(url, 'https:')).toContain('HTTP');
    expect(isWebStream(url)).toBe(true);
    expect(streamProblem(url, 'http:')).toBeNull();
  });

  it('accepts a secure playlist without rewriting its signed URL', () => {
    const url = 'https://example.org/live.m3u8?token=a%2Fb&expires=123';
    expect(streamProblem(url, 'https:')).toBeNull();
    expect(isDirectVideo(url)).toBe(false);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/stream.mp4', 'rtmp://example.org/live', 'not a URL'])('rejects links browsers cannot safely open as a web stream: %s', url => {
    expect(isWebStream(url)).toBe(false);
    expect(streamProblem(url, 'https:')).not.toBeNull();
  });

  it('recognizes direct video despite uppercase extensions and signed query strings', () => {
    expect(isDirectVideo('https://example.org/stream.MP4?token=123')).toBe(true);
    expect(isDirectVideo('https://example.org/live?file=video.mp4')).toBe(false);
    expect(streamProblem(undefined, 'https:')).toContain('source');
  });
});
