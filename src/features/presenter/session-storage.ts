import { isPresenterSessionId, type PresenterCheckpoint, type PresenterSessionRecord, type PresenterSessionSource } from "./session-types";

const DATABASE = "lesson-builder-presenter-recovery";
const STORE = "sessions";
const CHECKPOINTS = "checkpoints";

function sessionKey(owner: string, id: string) {
  if (!owner || !isPresenterSessionId(id)) throw new Error("Invalid presenter session.");
  return [owner, id];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Local presenter recovery storage is unavailable. Allow browser storage and try again."));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: ["owner", "id"] });
      request.result.createObjectStore(CHECKPOINTS, { keyPath: ["owner", "id"] });
    };
    request.onerror = () => reject(new Error("Could not open local presenter recovery storage."));
    let blocked = false;
    request.onblocked = () => { blocked = true; reject(new Error("Local presenter recovery storage is blocked. Close other Lesson Builder tabs and try again.")); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    const tx = db.transaction([STORE, CHECKPOINTS], mode);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error("Could not save local presenter recovery. Check available device storage and use Save to Builder.")); };
    try { operation(tx.objectStore(STORE), value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export async function createPresenterSession(owner: string, source: PresenterSessionSource): Promise<string> {
  const id = crypto.randomUUID();
  sessionKey(owner, id);
  await transact<void>("readwrite", store => {
    store.add({ version: 1, owner, id, source, revision: 0, updatedAt: Date.now() } satisfies PresenterSessionRecord);
  });
  return id;
}

export async function readPresenterSession(owner: string, id: string): Promise<PresenterSessionRecord | null> {
  const key = sessionKey(owner, id);
  return transact("readonly", (store, result) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const record = request.result as PresenterSessionRecord | undefined;
      if (!record) { result(null); return; }
      if (record.version !== 1 || record.owner !== owner || record.id !== id || !record.source?.document || !Number.isSafeInteger(record.revision)) {
        store.transaction.abort(); return;
      }
      const checkpoint = store.transaction.objectStore(CHECKPOINTS).get(key);
      checkpoint.onsuccess = () => {
        const saved = checkpoint.result as Pick<PresenterSessionRecord, "checkpoint" | "revision" | "updatedAt"> | undefined;
        if (saved && (!Number.isSafeInteger(saved.revision) || saved.revision < 0)) { store.transaction.abort(); return; }
        result(saved ? { ...record, ...saved } : record);
      };
    };
  });
}

/** Persist launch eligibility separately: a failed large checkpoint must not republish on reload. */
export async function markPresenterOpened(owner: string, id: string): Promise<boolean> {
  const key = sessionKey(owner, id);
  return transact("readwrite", (store, result) => {
    const source = store.getKey(key);
    source.onsuccess = () => {
      if (!source.result) { store.transaction.abort(); return; }
      const checkpoints = store.transaction.objectStore(CHECKPOINTS);
      const previous = checkpoints.get(key);
      previous.onsuccess = () => {
        result(!previous.result?.opened);
        checkpoints.put({ owner, id, revision: 0, updatedAt: Date.now(), ...previous.result, opened: true });
      };
    };
  });
}

export async function writePresenterCheckpoint(owner: string, id: string, checkpoint: PresenterCheckpoint, revision: number): Promise<void> {
  const key = sessionKey(owner, id);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid presenter checkpoint revision.");
  await transact<void>("readwrite", store => {
    const request = store.getKey(key);
    request.onsuccess = () => {
      if (!request.result) { store.transaction.abort(); return; }
      const checkpoints = store.transaction.objectStore(CHECKPOINTS);
      const previous = checkpoints.get(key);
      previous.onsuccess = () => {
        if (revision <= (previous.result?.revision || 0)) return;
        checkpoints.put({ ...previous.result, owner, id, checkpoint, revision, updatedAt: Date.now() });
      };
    };
  });
}
