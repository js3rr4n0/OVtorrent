export const MAX_FOLDER_FILES = 500;
export const MAX_DEPTH = 6;
export const MEDIA_EXT = /\.(mp4|m4v|webm|ogv|mkv|mov|mp3|m4a|ogg|opus|wav|flac|aac)$/i;

export interface DirectoryHandleLike {
  name: string;
  values(): AsyncIterable<
    {
      kind: 'file' | 'directory';
      name: string;
      getFile?: () => Promise<File>;
    } & Partial<DirectoryHandleLike>
  >;
}

/** Walks a directory handle (File System Access API) collecting media files, bounded in depth and count. */
export async function collectMediaFiles(
  dir: DirectoryHandleLike,
  prefix = '',
  depth = 0,
  out: Array<{ file: File; path: string }> = [],
): Promise<Array<{ file: File; path: string }>> {
  if (depth > MAX_DEPTH) return out;
  for await (const entry of dir.values()) {
    if (out.length >= MAX_FOLDER_FILES) break;
    if (entry.kind === 'file' && entry.getFile && MEDIA_EXT.test(entry.name)) {
      out.push({ file: await entry.getFile(), path: `${prefix}${entry.name}` });
    } else if (entry.kind === 'directory' && entry.values) {
      await collectMediaFiles(
        entry as DirectoryHandleLike,
        `${prefix}${entry.name}/`,
        depth + 1,
        out,
      );
    }
  }
  return out;
}
