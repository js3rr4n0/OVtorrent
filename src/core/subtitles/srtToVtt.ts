/**
 * Local subtitle handling. SRT is converted to WebVTT entirely in the
 * browser; nothing is uploaded anywhere. Only <i>, <b>, <u> and <v> tags
 * survive the conversion: everything else is rendered as plain text.
 */
export type SubtitleFormat = 'vtt' | 'srt' | 'unknown';

export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

export function detectSubtitleFormat(text: string): SubtitleFormat {
  const head = text
    .replace(/^\uFEFF/, '')
    .trimStart()
    .slice(0, 200);
  if (/^WEBVTT/.test(head)) return 'vtt';
  if (/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(text))
    return 'srt';
  return 'unknown';
}

const ALLOWED_TAGS = /<\/?(i|b|u|v(?:\s[^>]*)?)>/gi;

function sanitizeCueText(line: string): string {
  const kept: string[] = [];
  const withPlaceholders = line.replace(ALLOWED_TAGS, (tag) => {
    kept.push(tag);
    return `\uE000${kept.length - 1}\uE000`;
  });
  const stripped = withPlaceholders
    .replace(/<[^>]*>/g, '')
    .replace(/[&]/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return stripped.replace(/\uE000(\d+)\uE000/g, (_m, i) => kept[Number(i)] ?? '');
}

function normalizeTimestamp(ts: string): string {
  // SRT uses comma as decimal separator and allows single-digit hours.
  const m = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(ts.trim());
  if (!m) return ts.trim().replace(',', '.');
  const [, h = '0', mm = '00', ss = '00', ms = '0'] = m;
  return `${h.padStart(2, '0')}:${mm}:${ss}.${ms.padEnd(3, '0')}`;
}

export interface SrtConversion {
  vtt: string;
  cues: number;
  skipped: number;
}

export function srtToVtt(input: string): SrtConversion {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const out: string[] = ['WEBVTT', ''];
  let cues = 0;
  let skipped = 0;
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    let idx = 0;
    if (/^\d+$/.test(lines[0]!.trim())) idx = 1;
    const timing = lines[idx];
    const m = timing ? /^(\S+)\s*-->\s*(\S+)(.*)$/.exec(timing.trim()) : null;
    if (!m) {
      skipped++;
      continue;
    }
    const start = normalizeTimestamp(m[1]!);
    const end = normalizeTimestamp(m[2]!);
    const body = lines.slice(idx + 1).map(sanitizeCueText);
    if (body.length === 0) {
      skipped++;
      continue;
    }
    out.push(`${start} --> ${end}`, ...body, '');
    cues++;
  }
  return { vtt: out.join('\n'), cues, skipped };
}

/** Returns WebVTT text for a .srt or .vtt input, or null when the format is unknown. */
export function toWebVtt(
  text: string,
): { vtt: string; format: SubtitleFormat; cues?: number } | null {
  const format = detectSubtitleFormat(text);
  if (format === 'vtt') return { vtt: text.replace(/^\uFEFF/, ''), format };
  if (format === 'srt') {
    const r = srtToVtt(text);
    return r.cues > 0 ? { vtt: r.vtt, format, cues: r.cues } : null;
  }
  return null;
}

export function vttObjectUrl(vtt: string): string {
  return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
}
