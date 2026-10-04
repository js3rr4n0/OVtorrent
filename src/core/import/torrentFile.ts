/**
 * Minimal, safe inspection of a `.torrent` file: validates the bencode
 * structure and extracts the name, file list and info hash. Nothing is
 * executed and the raw file is never persisted.
 */
export interface TorrentSummary {
  name: string;
  files: { path: string; length: number }[];
  totalLength: number;
  infoHash: string;
  announce: string[];
  webSocketTrackers: string[];
}

type Bencoded = number | Uint8Array | Bencoded[] | { [key: string]: Bencoded };

class BencodeDecoder {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}
  decode(): { value: Bencoded; infoRange?: [number, number] } {
    const value = this.next(true);
    if (this.pos !== this.buf.length) throw new Error('Datos sobrantes en el torrent');
    return { value, infoRange: this.infoRange };
  }
  private infoRange?: [number, number];
  private next(top = false): Bencoded {
    const c = this.buf[this.pos];
    if (c === undefined) throw new Error('Torrent truncado');
    if (c === 0x69 /* i */) return this.int();
    if (c === 0x6c /* l */) return this.list();
    if (c === 0x64 /* d */) return this.dict(top);
    return this.bytes();
  }
  private int(): number {
    this.pos++;
    const end = this.buf.indexOf(0x65, this.pos);
    if (end < 0) throw new Error('Entero bencode inválido');
    const s = textDecoder.decode(this.buf.subarray(this.pos, end));
    if (!/^-?\d+$/.test(s)) throw new Error('Entero bencode inválido');
    this.pos = end + 1;
    return Number(s);
  }
  private bytes(): Uint8Array {
    const colon = this.buf.indexOf(0x3a, this.pos);
    if (colon < 0) throw new Error('Cadena bencode inválida');
    const lenStr = textDecoder.decode(this.buf.subarray(this.pos, colon));
    if (!/^\d+$/.test(lenStr)) throw new Error('Longitud bencode inválida');
    const len = Number(lenStr);
    const start = colon + 1;
    if (start + len > this.buf.length) throw new Error('Cadena bencode truncada');
    this.pos = start + len;
    return this.buf.subarray(start, start + len);
  }
  private list(): Bencoded[] {
    this.pos++;
    const out: Bencoded[] = [];
    while (this.buf[this.pos] !== 0x65) {
      if (this.pos >= this.buf.length) throw new Error('Lista bencode truncada');
      out.push(this.next());
    }
    this.pos++;
    return out;
  }
  private dict(top: boolean): { [key: string]: Bencoded } {
    this.pos++;
    const out: { [key: string]: Bencoded } = Object.create(null);
    while (this.buf[this.pos] !== 0x65) {
      if (this.pos >= this.buf.length) throw new Error('Diccionario bencode truncado');
      const key = textDecoder.decode(this.bytes());
      const start = this.pos;
      const value = this.next();
      if (top && key === 'info') this.infoRange = [start, this.pos];
      out[key] = value;
    }
    this.pos++;
    return out;
  }
}

const textDecoder = new TextDecoder();

async function sha1Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', data.slice().buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function asString(v: Bencoded | undefined): string {
  return v instanceof Uint8Array ? textDecoder.decode(v).replace(/[<>]/g, '').slice(0, 255) : '';
}

export const MAX_TORRENT_BYTES = 4 * 1024 * 1024;

export async function parseTorrentFile(buffer: ArrayBuffer): Promise<TorrentSummary> {
  if (buffer.byteLength > MAX_TORRENT_BYTES) throw new Error('Archivo .torrent demasiado grande');
  const { value, infoRange } = new BencodeDecoder(new Uint8Array(buffer)).decode();
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    throw new Error('El archivo no es un torrent válido');
  }
  const info = value.info;
  if (
    !info ||
    typeof info !== 'object' ||
    Array.isArray(info) ||
    info instanceof Uint8Array ||
    !infoRange
  ) {
    throw new Error('El torrent no contiene un diccionario info');
  }
  const name = asString(info.name) || 'Sin nombre';
  const files: { path: string; length: number }[] = [];
  if (Array.isArray(info.files)) {
    for (const f of info.files.slice(0, 2000)) {
      if (typeof f !== 'object' || f === null || Array.isArray(f) || f instanceof Uint8Array)
        continue;
      const parts = Array.isArray(f.path) ? f.path.map(asString) : [];
      files.push({ path: parts.join('/'), length: typeof f.length === 'number' ? f.length : 0 });
    }
  } else {
    files.push({ path: name, length: typeof info.length === 'number' ? info.length : 0 });
  }
  const announce: string[] = [];
  if (value.announce instanceof Uint8Array) announce.push(asString(value.announce));
  if (Array.isArray(value['announce-list'])) {
    for (const tier of value['announce-list']) {
      if (Array.isArray(tier)) for (const t of tier) announce.push(asString(t));
    }
  }
  const infoHash = await sha1Hex(new Uint8Array(buffer).subarray(infoRange[0], infoRange[1]));
  return {
    name,
    files,
    totalLength: files.reduce((a, f) => a + f.length, 0),
    infoHash,
    announce: announce.filter(Boolean),
    webSocketTrackers: announce.filter((t) => /^wss?:\/\//i.test(t)),
  };
}

export function magnetFromTorrent(summary: TorrentSummary): string {
  const p = new URLSearchParams();
  p.append('xt', `urn:btih:${summary.infoHash}`);
  p.append('dn', summary.name);
  for (const t of summary.announce) p.append('tr', t);
  return `magnet:?${p.toString()}`;
}
