// Background lofi: the volume curve and the playlist order (the <audio> side needs a browser).
import { describe, expect, it } from 'vitest';
import { LOFI_TRACKS, musicGain, nextTrack } from './lofi';

describe('lofi', () => {
  it('maps the slider to a quiet, perceptual volume', () => {
    expect(musicGain(0)).toBe(0);
    expect(musicGain(1)).toBe(0.6);
    expect(musicGain(0.5)).toBeLessThan(0.3);
    expect(musicGain(-1)).toBe(0);
    expect(musicGain(5)).toBe(0.6);
  });

  it('plays the tracks one after the other and starts over', () => {
    expect(LOFI_TRACKS.length).toBeGreaterThan(1);
    expect(nextTrack(0)).toBe(1);
    expect(nextTrack(LOFI_TRACKS.length - 1)).toBe(0);
    expect(nextTrack(3, 0)).toBe(0);
  });
});
