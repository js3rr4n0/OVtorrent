export const STORAGE_PREFIX = 'ovtorrent:';

export const STORAGE_KEYS = {
  settings: `${STORAGE_PREFIX}settings`,
  library: `${STORAGE_PREFIX}library`,
  playlists: `${STORAGE_PREFIX}playlists`,
  favorites: `${STORAGE_PREFIX}favorites`,
  history: `${STORAGE_PREFIX}history`,
  navigation: `${STORAGE_PREFIX}navigation`,
  diagnostics: `${STORAGE_PREFIX}diagnostics`,
} as const;

export const SESSION_KEYS = {
  activeSession: `${STORAGE_PREFIX}session`,
} as const;

export const IDB_NAME = 'ovtorrent-ephemeral';
export const IDB_VERSION = 1;
export const IDB_STORE_CHUNKS = 'chunks';
