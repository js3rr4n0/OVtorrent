import { exportBundleSchema, type ExportBundle } from '@/core/schemas/export';
import { containsForbiddenKeys } from '@/core/schemas/playlist';
import { buildExportBundle } from '@/state/dataManagement';

export const EXPORT_SECTIONS = [
  'settings',
  'library',
  'playlists',
  'favorites',
  'history',
] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

export const SECTION_LABELS: Record<ExportSection, string> = {
  settings: 'Ajustes (tema, reproductor, calidad, búfer, TV, P2P)',
  library: 'Biblioteca',
  playlists: 'Playlists',
  favorites: 'Favoritos',
  history: 'Historial y progreso',
};

/** Full export restricted to the chosen sections. Nothing leaves the browser. */
export function buildPartialExport(sections: ExportSection[]): ExportBundle {
  const full = buildExportBundle();
  const out: ExportBundle = {
    format: full.format,
    version: full.version,
    exportedAt: full.exportedAt,
  };
  for (const s of sections) {
    if (s === 'settings') out.settings = full.settings;
    if (s === 'library') out.library = full.library;
    if (s === 'playlists') out.playlists = full.playlists;
    if (s === 'favorites') out.favorites = full.favorites;
    if (s === 'history') out.history = full.history;
  }
  return out;
}

export interface ImportPreview {
  ok: boolean;
  errors: string[];
  exportedAt?: string;
  counts: Partial<Record<ExportSection, number | 'sí'>>;
}

/** Validates a bundle and summarises what it contains before anything is applied. */
export function previewBundle(text: string): ImportPreview {
  if (text.length > 10 * 1024 * 1024)
    return { ok: false, errors: ['El archivo supera 10 MB'], counts: {} };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSON no válido'], counts: {} };
  }
  const forbidden = containsForbiddenKeys(data);
  if (forbidden)
    return { ok: false, errors: [`Campo no permitido por seguridad: ${forbidden}`], counts: {} };
  const parsed = exportBundleSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
      counts: {},
    };
  }
  const b = parsed.data;
  return {
    ok: true,
    errors: [],
    exportedAt: b.exportedAt,
    counts: {
      settings: b.settings ? 'sí' : undefined,
      library: b.library?.length,
      playlists: b.playlists?.length,
      favorites: b.favorites?.length,
      history: b.history?.length,
    },
  };
}
