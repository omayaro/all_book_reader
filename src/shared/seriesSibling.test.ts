import { describe, expect, it } from 'vitest';
import { parseSeriesName, seriesSiblingBasenames } from './seriesSibling';

describe('parseSeriesName', () => {
  it('parses trailing digits and extension', () => {
    expect(parseSeriesName('C:\\Books\\열혈강호45.zip')).toEqual({
      dir: 'C:\\Books',
      prefix: '열혈강호',
      digits: '45',
      number: 45,
      extension: '.zip',
    });
  });

  it('preserves zero-padding width in digits', () => {
    expect(parseSeriesName('/tmp/vol09.cbz')?.digits).toBe('09');
  });

  it('returns null when stem has no trailing digits', () => {
    expect(parseSeriesName('C:\\Books\\manual.pdf')).toBeNull();
  });
});

describe('seriesSiblingBasenames', () => {
  it('increments number and prefers current extension then fallbacks', () => {
    expect(seriesSiblingBasenames('C:\\Books\\열혈강호45.zip', 1)).toEqual([
      '열혈강호46.zip',
      '열혈강호46.cbz',
      '열혈강호46.pdf',
      '열혈강호46.epub',
      '열혈강호46.txt',
    ]);
  });

  it('can resolve zip to pdf via fallback list (same stem)', () => {
    const names = seriesSiblingBasenames('/manga/열혈강호45.zip', 1);
    expect(names).toContain('열혈강호46.pdf');
    expect(names?.[0]).toBe('열혈강호46.zip');
  });

  it('keeps zero-padding when width allows', () => {
    expect(seriesSiblingBasenames('/tmp/vol09.cbz', 1)?.[0]).toBe('vol10.cbz');
    expect(seriesSiblingBasenames('/tmp/vol09.cbz', -1)?.[0]).toBe('vol08.cbz');
  });

  it('grows digit width past pad when needed', () => {
    expect(seriesSiblingBasenames('/tmp/vol99.zip', 1)?.[0]).toBe('vol100.zip');
  });

  it('returns null for invalid delta or missing previous volume', () => {
    expect(seriesSiblingBasenames('/tmp/vol01.zip', 0)).toBeNull();
    expect(seriesSiblingBasenames('/tmp/vol01.zip', -1)).toBeNull();
    expect(seriesSiblingBasenames('/tmp/manual.pdf', 1)).toBeNull();
  });

  it('prefers current pdf extension before zip fallback', () => {
    expect(seriesSiblingBasenames('/tmp/book12.pdf', 1)?.[0]).toBe('book13.pdf');
    expect(seriesSiblingBasenames('/tmp/book12.pdf', 1)?.[1]).toBe('book13.zip');
  });
});
