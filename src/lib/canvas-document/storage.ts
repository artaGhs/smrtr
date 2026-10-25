import { parseDocument, serializeDocument } from './serialization';
import type { CanvasDocument } from './model';
export type StoredCanvas = { key: string; title: string; updatedAt: string; json: string };
const DB = 'smrtr-canvas-editor-v1';
const knownVersions = new Map<string, string | null>();
const unreadable = new Set<string>();
export class CanvasSaveConflictError extends Error {}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Local storage is unavailable. Download a backup to keep your work.')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('documents')) request.result.createObjectStore('documents', { keyPath: 'key' }); };
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('Another tab is blocking local storage. Close it and retry.'));
  });
}
export async function saveDocument(key: string, document: CanvasDocument): Promise<void> {
  if (unreadable.has(key)) throw new Error('The saved copy could not be read. It is preserved; download your current canvas as a new backup.');
  const json = serializeDocument(document);
  if (json.length > 12_000_000) throw new Error('Canvas exceeds the local file limit. Download a backup.');
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    let conflict = false;
    const read = store.get(key);
    read.onsuccess = () => {
      const current = (read.result as StoredCanvas | undefined)?.json ?? null;
      if (current !== (knownVersions.get(key) ?? null)) { conflict = true; tx.abort(); return; }
      store.put({ key, title: document.source.title, updatedAt: document.updatedAt, json });
    };
    tx.oncomplete = () => { knownVersions.set(key, json); resolve(); }; tx.onerror = () => reject(tx.error ?? new Error('Save failed. Download a backup.')); tx.onabort = () => reject(conflict ? new CanvasSaveConflictError('Changed in another tab. Download your edits, then reload to open the saved canvas.') : tx.error ?? new Error('Save interrupted.'));
  }); } finally { db.close(); }
}

/** A competing tab keeps its saved version; retain this tab's work under a new identity. */
export async function saveBeforeSwitch(prefix: string, document: CanvasDocument, write = saveDocument, uniqueId = () => crypto.randomUUID()): Promise<string | undefined> {
  try { await write(`${prefix}:${document.source.id}`, document); }
  catch (error) {
    if (!(error instanceof CanvasSaveConflictError)) throw error;
    const recovered = structuredClone(document);
    recovered.source.id = `${document.source.id.slice(0, 180)}:recovery:${uniqueId()}`;
    recovered.source.title = `${document.source.title.slice(0, 180)} (recovered edits)`;
    await write(`${prefix}:${recovered.source.id}`, recovered);
    return 'Your competing edits were saved as a separate canvas in Saved canvases.';
  }
}
export async function loadDocument(key: string): Promise<CanvasDocument | null> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('documents').objectStore('documents').get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { try { const record = request.result as StoredCanvas | undefined; const parsed = record ? parseDocument(record.json) : null; knownVersions.set(key, record?.json ?? null); unreadable.delete(key); resolve(parsed); } catch (e) { unreadable.add(key); reject(e); } };
  }); } finally { db.close(); }
}
export async function listDocuments(prefix: string): Promise<StoredCanvas[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('documents').objectStore('documents').getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as StoredCanvas[]).filter(r => r.key.startsWith(`${prefix}:`)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }); } finally { db.close(); }
}
