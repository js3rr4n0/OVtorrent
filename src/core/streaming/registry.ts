import type { MediaItem } from '../schemas/media';
import { hasMediaSource, hasRTCDataChannel, hasWebRTC } from './capabilities';
import { HtmlMediaEngine } from './HtmlMediaEngine';
import type { StreamingEngine } from './types';

export interface EngineResolution {
  engine: StreamingEngine | null;
  /** Reasons shown to the user when no engine can play the item. */
  reasons: string[];
  /** Roadmap note (never presented as working functionality). */
  futureNote?: string;
}

const htmlEngine = new HtmlMediaEngine();

/**
 * Picks the engine for a source type. P2P sources (magnet/torrent) are
 * imported and organised in Phase 1 but their WebTorrent engine lands in
 * Phase 2, so we report that honestly instead of pretending to play them.
 */
export function resolveEngine(sourceType: MediaItem['sourceType']): EngineResolution {
  switch (sourceType) {
    case 'file':
    case 'url':
      return { engine: htmlEngine, reasons: [] };
    case 'magnet':
    case 'torrent': {
      const reasons: string[] = [
        'El motor WebTorrent para navegador se integra en la Fase 2. En esta versión puedes importar y organizar magnets, pero aún no reproducirlos.',
      ];
      if (!hasWebRTC() || !hasRTCDataChannel()) {
        reasons.push(
          'Este navegador no expone WebRTC DataChannels; sin ellos no es posible conectar con peers desde la web.',
        );
      }
      if (!hasMediaSource()) {
        reasons.push(
          'Este navegador no expone MediaSource Extensions; la reproducción progresiva P2P no será posible.',
        );
      }
      return {
        engine: null,
        reasons,
        futureNote:
          'Cuando esté disponible, el navegador solo podrá conectarse a peers compatibles con WebRTC/WebTorrent, no a todos los peers BitTorrent tradicionales.',
      };
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
