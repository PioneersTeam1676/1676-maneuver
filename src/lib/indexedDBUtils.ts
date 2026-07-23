// LEGACY read-only access to the pre-Dexie IndexedDB database.
//
// This file used to contain a full parallel implementation of
// saveScoutingEntry / saveScoutingEntries / import / export against raw
// IndexedDB, duplicating (and drifting from) the authoritative Dexie-based
// versions in dexieDB.ts. Nothing imported those duplicates, but they were a
// trap: a future contributor could import the wrong one and write entries
// that never sync. They have been deleted.
//
// What remains is ONLY what the one-time migration path still needs:
// reading entries out of the old 'SimpleScoutingDB_v2' database so
// dexieDB.migrateFromIndexedDB() / migrationUtils.ts can copy them into
// Dexie. Do not add write helpers here — all reads and writes go through
// dexieDB.ts (see DEXIE_README.md).

const DB_NAME = 'SimpleScoutingDB_v2';
const DB_VERSION = 1;
const STORE_NAME = 'scoutingData';

let dbInstance: IDBDatabase | null = null;

const initializeDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open legacy IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Opening on a device that never had the legacy database creates an
        // empty store; the migration then simply finds zero entries.
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export interface ScoutingEntryDB {
  id: string;
  teamNumber?: string;
  matchNumber?: string;
  alliance?: string;
  scoutName?: string;
  eventName?: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export const loadAllScoutingEntries = async (): Promise<ScoutingEntryDB[]> => {
  const db = await initializeDB();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => reject(request.error);
  });
};
