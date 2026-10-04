import { IDB_NAME, IDB_STORE_CHUNKS, IDB_VERSION } from './keys';

/**
 * Thin promise wrapper over IndexedDB. IndexedDB here is *browser-local*
 * storage: it is not a remote database and there is no server behind it.
 */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openEphemeralDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_CHUNKS)) {
        const store = db.createObjectStore(IDB_STORE_CHUNKS, { keyPath: 'key' });
        store.createIndex('bySession', 'sessionId', { unique: false });
        store.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'));
  });
}

export function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Error de IndexedDB'));
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transacción fallida'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}

export function deleteEphemeralDb(): Promise<void> {
  return new Promise((resolve) => {
    if (!isIndexedDbAvailable()) {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
