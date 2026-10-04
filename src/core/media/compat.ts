export interface CodecCheck {
  id: string;
  label: string;
  mime: string;
  kind: 'video' | 'audio' | 'subtitle' | 'container';
  /** "probably" | "maybe" | "" as returned by canPlayType, or "n/a". */
  result: string;
  supported: boolean;
  note?: string;
}

const CHECKS: Array<Omit<CodecCheck, 'result' | 'supported'>> = [
  {
    id: 'mp4-h264',
    label: 'MP4 H.264/AAC',
    mime: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    kind: 'video',
  },
  { id: 'webm-vp8', label: 'WebM VP8/Opus', mime: 'video/webm; codecs="vp8, opus"', kind: 'video' },
  { id: 'webm-vp9', label: 'WebM VP9/Opus', mime: 'video/webm; codecs="vp9, opus"', kind: 'video' },
  {
    id: 'hevc',
    label: 'HEVC (H.265)',
    mime: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
    kind: 'video',
    note: 'Depende del hardware y del navegador.',
  },
  {
    id: 'av1',
    label: 'AV1',
    mime: 'video/mp4; codecs="av01.0.05M.08"',
    kind: 'video',
    note: 'Depende del hardware y del navegador.',
  },
  {
    id: 'hls',
    label: 'HLS nativo',
    mime: 'application/vnd.apple.mpegurl',
    kind: 'container',
    note: 'Sin soporte nativo se necesitaría MediaSource (Fase 3).',
  },
  {
    id: 'mkv',
    label: 'MKV (Matroska)',
    mime: 'video/x-matroska',
    kind: 'container',
    note: 'Solo si los codecs internos son reproducibles; el contenedor rara vez se declara.',
  },
  { id: 'aac', label: 'AAC', mime: 'audio/mp4; codecs="mp4a.40.2"', kind: 'audio' },
  { id: 'mp3', label: 'MP3', mime: 'audio/mpeg', kind: 'audio' },
  { id: 'opus', label: 'Opus', mime: 'audio/ogg; codecs="opus"', kind: 'audio' },
];

export function detectCodecSupport(): CodecCheck[] {
  if (typeof document === 'undefined') {
    return CHECKS.map((c) => ({ ...c, result: 'n/a', supported: false }));
  }
  const video = document.createElement('video');
  const audio = document.createElement('audio');
  return CHECKS.map((c) => {
    let result = '';
    try {
      result = (c.kind === 'audio' ? audio : video).canPlayType(c.mime);
    } catch {
      result = '';
    }
    return { ...c, result: result || 'no', supported: result === 'probably' || result === 'maybe' };
  }).concat([
    {
      id: 'webvtt',
      label: 'WebVTT (subtítulos)',
      mime: 'text/vtt',
      kind: 'subtitle',
      result: typeof TextTrack === 'function' ? 'probably' : 'no',
      supported: typeof TextTrack === 'function',
      note: 'SRT se convierte localmente a WebVTT (Fase 3).',
    },
  ]);
}

export function guessPlayableByName(name: string): 'likely' | 'unlikely' | 'unknown' {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (
    ['mp4', 'm4v', 'webm', 'ogv', 'mp3', 'm4a', 'ogg', 'opus', 'wav', 'aac', 'flac'].includes(ext)
  )
    return 'likely';
  if (['mkv', 'avi', 'wmv', 'flv', 'mov', 'ts', 'mpg', 'mpeg', 'rmvb', 'iso'].includes(ext))
    return 'unlikely';
  return 'unknown';
}
