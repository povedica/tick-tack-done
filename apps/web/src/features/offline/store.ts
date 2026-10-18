import type { PendingMutation } from './replay';

const DB_NAME = 'reflexionia-offline';
const STORE = 'mutations';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('indexedDB'));
    };
  });
}

export const offlineStore = {
  async list(): Promise<readonly PendingMutation[]> {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => {
        resolve(request.result as PendingMutation[]);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('indexedDB'));
      };
    });
  },
  async put(item: PendingMutation): Promise<void> {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error('indexedDB'));
      };
    });
  },
  async remove(id: string): Promise<void> {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error('indexedDB'));
      };
    });
  },
};
