import { useEffect, useState } from 'react';
import { Field, Input, Select } from '@/components/ui';
import type { MediaItem } from '@/core/schemas/media';
import type { StreamingSession } from '@/core/streaming';
import { MAX_SUBTITLE_BYTES, toWebVtt, vttObjectUrl } from '@/core/subtitles/srtToVtt';

export interface TrackSelectorsProps {
  session: StreamingSession | null;
  /** Playlist items with the same title and a declared quality (fallback when the engine has no variants). */
  playlistVariants: MediaItem[];
  currentItem: MediaItem;
  onPlaylistVariant: (item: MediaItem) => void;
  /** Receives the WebVTT URL to attach as <track>, or null to remove it. */
  onSubtitleUrl: (url: string | null) => void;
}

const LOCAL_PREFIX = 'local';

/**
 * Quality, audio and subtitle selectors. Every option comes from something
 * that really exists: HLS variants/tracks declared by the playlist, audio
 * tracks the browser exposes, subtitle files inside a torrent, or files the
 * user picks. Nothing is transcoded or invented.
 */
export function TrackSelectors({
  session,
  playlistVariants,
  currentItem,
  onPlaylistVariant,
  onSubtitleUrl,
}: TrackSelectorsProps) {
  const [localSubtitle, setLocalSubtitle] = useState<{
    name: string;
    url: string;
    cues?: number;
  } | null>(null);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>('none');

  const engineVariants = session?.variants?.() ?? [];
  const audioTracks = session?.audioTracks?.() ?? [];
  const engineSubtitles = session?.subtitleTracks?.() ?? [];

  // Release the local subtitle object URL when it changes or on unmount.
  useEffect(
    () => () => {
      if (localSubtitle) URL.revokeObjectURL(localSubtitle.url);
    },
    [localSubtitle],
  );

  const onLocalFile = async (file: File | undefined) => {
    setSubtitleError(null);
    if (!file) return;
    if (file.size > MAX_SUBTITLE_BYTES) {
      setSubtitleError('El archivo de subtítulos supera 2 MB.');
      return;
    }
    const converted = toWebVtt(await file.text());
    if (!converted) {
      setSubtitleError('Formato no reconocido: solo .srt o .vtt (WebVTT).');
      return;
    }
    const url = vttObjectUrl(converted.vtt);
    setLocalSubtitle({ name: file.name, url, cues: converted.cues });
    setSelectedSubtitle(LOCAL_PREFIX);
    if (session?.selectSubtitleTrack) void session.selectSubtitleTrack(null);
    onSubtitleUrl(url);
  };

  const onSubtitleChange = async (value: string) => {
    setSelectedSubtitle(value);
    if (value === 'none') {
      if (session?.selectSubtitleTrack) await session.selectSubtitleTrack(null);
      onSubtitleUrl(null);
      return;
    }
    if (value === LOCAL_PREFIX) {
      if (session?.selectSubtitleTrack) await session.selectSubtitleTrack(null);
      onSubtitleUrl(localSubtitle?.url ?? null);
      return;
    }
    const url = (await session?.selectSubtitleTrack?.(value)) ?? null;
    onSubtitleUrl(url);
  };

  const qualityHint =
    engineVariants.length > 0
      ? 'Variantes declaradas por la playlist HLS. «Auto» deja que hls.js adapte según el ancho de banda y tus límites de calidad.'
      : 'Solo puede elegir entre versiones existentes en la playlist con el mismo título. Un archivo único no se transcodifica.';

  return (
    <div className="ovt-surface rounded-lg p-3">
      <Field label="Calidad" htmlFor="quality" hint={qualityHint}>
        {engineVariants.length > 0 ? (
          <Select
            id="quality"
            value={engineVariants.find((v) => v.active)?.id ?? 'auto'}
            onChange={(e) => void session?.selectVariant?.(e.target.value)}
          >
            {engineVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        ) : (
          <Select
            id="quality"
            value={currentItem.id}
            disabled={playlistVariants.length === 0}
            onChange={(e) => {
              const target = playlistVariants.find((i) => i.id === e.target.value);
              if (target) onPlaylistVariant(target);
            }}
          >
            <option value={currentItem.id}>{currentItem.qualityLabel ?? 'Original'}</option>
            {playlistVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.qualityLabel}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Pista de audio"
        htmlFor="audio-track"
        hint={
          audioTracks.length > 0
            ? 'Pistas alternativas declaradas por la fuente. El audio multicanal depende de los codecs del dispositivo.'
            : 'Solo cuando la fuente declara pistas alternativas y el navegador las expone (HLS con hls.js, o AudioTrackList en Safari).'
        }
      >
        <Select
          id="audio-track"
          disabled={audioTracks.length === 0}
          value={audioTracks.find((t) => t.active)?.id ?? ''}
          onChange={(e) => void session?.selectAudioTrack?.(e.target.value)}
        >
          {audioTracks.length === 0 ? <option value="">Predeterminada</option> : null}
          {audioTracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.lang ? ` (${t.lang})` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Subtítulos"
        htmlFor="subtitle-track"
        hint="Archivos .srt se convierten localmente a WebVTT. Nada se envía a ningún servidor."
        error={subtitleError ?? undefined}
      >
        <div className="flex flex-col gap-2 md:flex-row">
          <Select
            id="subtitle-track"
            value={selectedSubtitle}
            onChange={(e) => void onSubtitleChange(e.target.value)}
          >
            <option value="none">Sin subtítulos</option>
            {localSubtitle ? (
              <option value={LOCAL_PREFIX}>
                {localSubtitle.name}
                {localSubtitle.cues ? ` (${localSubtitle.cues} líneas)` : ''}
              </option>
            ) : null}
            {engineSubtitles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.lang ? ` (${t.lang})` : ''}
                {t.detail ? ` · ${t.detail}` : ''}
              </option>
            ))}
          </Select>
          <Input
            id="subs-file"
            type="file"
            accept=".vtt,.srt,text/vtt,application/x-subrip"
            aria-label="Cargar subtítulos locales (.srt o .vtt)"
            onChange={(e) => void onLocalFile(e.target.files?.[0])}
            className="md:w-64"
          />
        </div>
      </Field>
    </div>
  );
}
