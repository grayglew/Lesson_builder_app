"use client";

import {
  type BuilderDocument,
  builderDocumentSchema,
  normalizeBuilderDocument,
} from "./schema";

export const V2_LOCAL_STORAGE_KEY = "lesson-builder-v2:recovery:v1";
export const V2_DATABASE_NAME = "lesson-builder-v2-recovery";
const DATABASE_VERSION = 1;
const STORE_NAME = "documents";
const CURRENT_DOCUMENT_ID = "current";

type StoredDocument = {
  id: typeof CURRENT_DOCUMENT_ID;
  document: BuilderDocument;
};

export async function loadV2CachedDocument(): Promise<BuilderDocument | null> {
  if (typeof window === "undefined") return null;

  const [indexedDocument, lightweightDocument] = await Promise.all([
    loadFromIndexedDb(),
    Promise.resolve(loadFromLocalStorage()),
  ]);
  if (!indexedDocument) return lightweightDocument;
  if (!lightweightDocument) return indexedDocument;

  return timestampValue(indexedDocument.updatedAt) >=
    timestampValue(lightweightDocument.updatedAt)
    ? indexedDocument
    : lightweightDocument;
}

export async function saveV2CachedDocument(document: BuilderDocument) {
  if (typeof window === "undefined") return;
  const parsed = builderDocumentSchema.parse(document);
  saveToLocalStorage(parsed);
  await saveToIndexedDb(parsed);
}

function loadFromLocalStorage(): BuilderDocument | null {
  try {
    const raw = window.localStorage.getItem(V2_LOCAL_STORAGE_KEY);
    return raw ? normalizeBuilderDocument(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function saveToLocalStorage(document: BuilderDocument) {
  try {
    const lightweight = {
      ...document,
      slides: document.slides.map(stripEmbeddedAssetData),
      retrievalItems: [],
      slideTemplates: [],
      recoveryCopy: "lightweight",
    };
    window.localStorage.setItem(V2_LOCAL_STORAGE_KEY, JSON.stringify(lightweight));
  } catch {
    // IndexedDB remains the authoritative v2 recovery cache.
  }
}

async function loadFromIndexedDb(): Promise<BuilderDocument | null> {
  if (!window.indexedDB) return null;
  try {
    const database = await openDatabase();
    const result = await new Promise<StoredDocument | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_DOCUMENT_ID);
      request.onsuccess = () => resolve(request.result as StoredDocument | undefined);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
    });
    return result?.document ? normalizeBuilderDocument(result.document) : null;
  } catch {
    return null;
  }
}

async function saveToIndexedDb(document: BuilderDocument) {
  if (!window.indexedDB) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      id: CURRENT_DOCUMENT_ID,
      document,
    } satisfies StoredDocument);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(V2_DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function stripEmbeddedAssetData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripEmbeddedAssetData) as T;
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "dataUrl" && typeof entry === "string" && entry.startsWith("data:")
        ? ""
        : stripEmbeddedAssetData(entry),
    ]),
  ) as T;
}

function timestampValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
