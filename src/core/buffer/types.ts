/**
 * Temporary buffer abstraction. Chunks live only while a playback session is
 * active and are removed when they fall outside the configured window.
 */
export interface BufferChunk {
  /** Session the chunk belongs to; everything is dropped when the session ends. */
  sessionId: string;
  /** Piece/segment index within the media. */
  index: number;
  /** Byte offset of the chunk in the media file. */
  offset: number;
  /** Media time (seconds) the chunk roughly corresponds to, when known. */
  timestamp: number;
  data: ArrayBuffer;
  createdAt: number;
}

export interface MediaRange {
  sessionId: string;
  /** Inclusive start timestamp (seconds). */
  fromTimestamp: number;
  /** Inclusive end timestamp (seconds). */
  toTimestamp: number;
}

export interface BufferWindow {
  sessionId: string;
  /** Current playback position (seconds). */
  position: number;
  /** Seconds kept behind the position. */
  behindSeconds: number;
  /** Seconds kept ahead of the position. */
  aheadSeconds: number;
}

export interface StorageUsage {
  bytes: number;
  chunks: number;
  limitBytes: number;
  kind: 'memory' | 'indexeddb' | 'none';
}

export interface EphemeralBufferStore {
  readonly kind: StorageUsage['kind'];
  write(chunk: BufferChunk): Promise<void>;
  read(range: MediaRange): Promise<BufferChunk | null>;
  removeBefore(timestamp: number): Promise<void>;
  removeOutsideWindow(window: BufferWindow): Promise<void>;
  clear(): Promise<void>;
  getUsage(): Promise<StorageUsage>;
}

export type PiecePriority = 'priority' | 'normal' | 'expired';

export interface WindowPolicyInput {
  position: number;
  behindSeconds: number;
  aheadSeconds: number;
  /** Number of pieces and seconds per piece in the active file. */
  pieceCount: number;
  secondsPerPiece: number;
}

export interface WindowPolicyResult {
  historyStart: number;
  historyEnd: number;
  futureStart: number;
  futureEnd: number;
  priorityPieces: number[];
  normalPieces: number[];
  expiredPieces: number[];
}

/** Computes which pieces are priority / normal / expired for the current window. */
export function computeWindowPolicy(input: WindowPolicyInput): WindowPolicyResult {
  const { position, behindSeconds, aheadSeconds, pieceCount, secondsPerPiece } = input;
  const spp = Math.max(secondsPerPiece, 0.001);
  const historyStart = Math.max(0, position - behindSeconds);
  const historyEnd = position;
  const futureStart = position;
  const futureEnd = position + aheadSeconds;

  const firstKept = Math.max(0, Math.floor(historyStart / spp));
  const current = Math.max(0, Math.min(pieceCount - 1, Math.floor(position / spp)));
  const lastKept = Math.min(pieceCount - 1, Math.floor(futureEnd / spp));
  /** Priority: the current piece and roughly the next third of the future window. */
  const priorityEnd = Math.min(
    pieceCount - 1,
    current + Math.max(1, Math.ceil((lastKept - current) / 3)),
  );

  const priorityPieces: number[] = [];
  const normalPieces: number[] = [];
  const expiredPieces: number[] = [];
  for (let i = 0; i < pieceCount; i++) {
    if (i < firstKept || i > lastKept) expiredPieces.push(i);
    else if (i >= current && i <= priorityEnd) priorityPieces.push(i);
    else normalPieces.push(i);
  }
  return {
    historyStart,
    historyEnd,
    futureStart,
    futureEnd,
    priorityPieces,
    normalPieces,
    expiredPieces,
  };
}
