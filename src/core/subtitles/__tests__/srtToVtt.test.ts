import { describe, expect, it } from 'vitest';
import { detectSubtitleFormat, srtToVtt, toWebVtt } from '../srtToVtt';

const SRT = `\uFEFF1\r\n00:00:01,000 --> 00:00:04,000\r\nHola <i>mundo</i>\r\n\r\n2\r\n00:00:05,500 --> 00:00:07,250\r\n<font color="red">Rojo</font> & <script>x</script>\r\nSegunda línea\r\n\r\n3\r\n00:01:00,000 --> 00:01:02,000\r\n\r\n`;

describe('srtToVtt', () => {
  it('detects formats', () => {
    expect(detectSubtitleFormat(SRT)).toBe('srt');
    expect(detectSubtitleFormat('WEBVTT\n\n00:00.000 --> 00:01.000\nx')).toBe('vtt');
    expect(detectSubtitleFormat('hello')).toBe('unknown');
  });

  it('converts SRT cues, normalises timestamps and strips unsafe tags', () => {
    const r = srtToVtt(SRT);
    expect(r.cues).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(r.vtt).toContain('00:00:01.000 --> 00:00:04.000\nHola <i>mundo</i>');
    expect(r.vtt).toContain('00:00:05.500 --> 00:00:07.250\nRojo &amp; x\nSegunda línea');
    expect(r.vtt).not.toContain('<font');
    expect(r.vtt).not.toContain('<script');
  });

  it('handles single-digit hours and missing indexes', () => {
    const r = srtToVtt('0:00:01,5 --> 0:00:02,75\nTexto');
    expect(r.vtt).toContain('00:00:01.500 --> 00:00:02.750');
  });

  it('toWebVtt passes VTT through, converts SRT and rejects unknown input', () => {
    expect(toWebVtt('\uFEFFWEBVTT\n\n00:00.000 --> 00:01.000\nx')?.vtt.startsWith('WEBVTT')).toBe(
      true,
    );
    expect(toWebVtt(SRT)?.cues).toBe(2);
    expect(toWebVtt('nada')).toBeNull();
    expect(toWebVtt('1\n00:00:01,000 --> 00:00:02,000\n')).toBeNull();
  });
});
