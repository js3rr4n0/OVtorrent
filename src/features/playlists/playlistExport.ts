import type { Playlist } from '@/core/schemas/playlist';

/** Produces the portable JSON (without the local id) and triggers a local download. */
export function playlistToJson(p: Playlist): string {
  const { id: _id, ...rest } = p;
  return JSON.stringify(rest, null, 2);
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) || 'playlist';
}
