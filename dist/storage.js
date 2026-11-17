import { decodeBackup, emptyDatabase } from './data.js';

const DATABASE_NAME = 'atlas-travel-log';
const STORE_NAME = 'atlas';
const DATA_KEY = 'database';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Dieser Browser unterstützt IndexedDB nicht.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Lokaler Speicher konnte nicht geöffnet werden.'));
    request.onblocked = () => reject(new Error('Lokaler Speicher wird von einem anderen Fenster blockiert.'));
  });
}

async function transaction(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = action(store);
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error('Speichervorgang fehlgeschlagen.'));
    tx.oncomplete = () => { database.close(); resolve(result); };
    tx.onerror = () => { database.close(); reject(tx.error || new Error('Speichervorgang fehlgeschlagen.')); };
    tx.onabort = () => { database.close(); reject(tx.error || new Error('Speichervorgang abgebrochen.')); };
  });
}

export async function loadDatabase() {
  const value = await transaction('readonly', store => store.get(DATA_KEY));
  if (value === undefined) return emptyDatabase();
  try {
    return decodeBackup(value);
  } catch {
    throw new Error('Vorhandene lokale Daten sind beschädigt. Sie wurden nicht überschrieben.');
  }
}

export function saveDatabase(database) {
  return transaction('readwrite', store => store.put(database, DATA_KEY));
}
