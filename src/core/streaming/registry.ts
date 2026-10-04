import type { MediaItem } from '../schemas/media';
import type { Settings } from '../schemas/settings';
import { hasRTCDataChannel, hasServiceWorker, hasWebRTC } from './capabilities';
import { HtmlMediaEngine } from './HtmlMediaEngine';
import type { StreamingEngine } from './types';
import { WebTorrentStreamingEngine } from './webtorrent/WebTorrentStreamingEngine';

export interface EngineResolution {
  engine: StreamingEngine | null;
  /** Reasons shown to the user when no engine can play the item. */
  reasons: string[];
  /** Roadmap note (never presented as working functionality). */
  futureNote?: string;
}

const htmlEngine = new HtmlMediaEngine();

export function webTorrentUnavailableReasons(): string[] {
  const reasons: string[] = [];
  if (!hasWebRTC() || !hasRTCDataChannel()) {
    reasons.push(
      'Este navegador no expone WebRTC DataChannels; sin ellos no es posible conectar con peers desde la web.',
    );
  }
  if (!hasServiceWorker()) {
    reasons.push(
      'Este navegador no expone Service Worker; sin él no es posible entregar el stream P2P al reproductor.',
    );
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    reasons.push(
      'La aplicación no se sirve desde un contexto seguro (HTTPS o localhost): WebRTC y Service Worker están deshabilitados.',
    );
  }
  return reasons;
}

/**
 * Picks the engine for a source type. P2P sources use WebTorrent in the
 * browser when the required APIs exist; otherwise the reasons are reported
 * honestly instead of pretending to play them.
 */
export function resolveEngine(
  sourceType: MediaItem['sourceType'],
  getSettings: () => Settings,
): EngineResolution {
  switch (sourceType) {
    case 'file':
    case 'url':
      return { engine: htmlEngine, reasons: [] };
    case 'magnet':
    case 'torrent': {
      const reasons = webTorrentUnavailableReasons();
      if (reasons.length > 0) return { engine: null, reasons };
      return { engine: new WebTorrentStreamingEngine({ getSettings }), reasons: [] };
    }
    case 'hls':
    case 'm3u':
      return {
        engine: null,
        reasons: ['La importación M3U/M3U8 y HLS multivariant se añaden en la Fase 3.'],
      };
    default:
      return { engine: null, reasons: ['Tipo de fuente no soportado.'] };
  }
}
