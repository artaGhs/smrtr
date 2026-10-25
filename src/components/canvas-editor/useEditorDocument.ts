'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasSource } from '@/lib/canvas-document/source';
import { commit, createDocument, rebaseDocument, rebaseHistory, redo, undo, type CanvasDocument, type History, type Overlay, type ViewState } from '@/lib/canvas-document/model';
import { curatedSource } from '@/lib/canvas-document/curated';
import { loadDocument, saveDocument, saveBeforeSwitch } from '@/lib/canvas-document/storage';

export function useEditorDocument(input: CanvasSource | undefined, storageKey: string, busy: boolean) {
  const fallback = useMemo(curatedSource, []);
  const source = input ?? fallback;
  const [document, setDocument] = useState(() => createDocument(source));
  const [history, setHistory] = useState<History>(() => ({ past: [], present: document.overlay, future: [] }));
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Opening local canvas…');
  const [saveError, setSaveError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const ref = useRef(document), historyRef = useRef(history), loaded = useRef(''), sourceStamp = useRef('');
  const generation = useRef(0);
  ref.current = document; historyRef.current = history;
  const replace = useCallback((next: CanvasDocument) => {
    ref.current = next; setDocument(next);
    const h = { past: [], present: next.overlay, future: [] }; historyRef.current = h; setHistory(h);
  }, []);
  useEffect(() => {
    if (busy) return;
    const stamp = JSON.stringify(source);
    if (sourceStamp.current === stamp && ready) return;
    if (loaded.current === source.id) {
      sourceStamp.current = stamp;
      const rebased = rebaseHistory(historyRef.current, ref.current, source);
      ref.current = rebased.document; historyRef.current = rebased.history;
      setDocument(rebased.document); setHistory(rebased.history);
      return;
    }
    const token = ++generation.current;
    setReady(false);
    const prior = loaded.current ? saveBeforeSwitch(storageKey, ref.current).then(notice => { if (notice) setRecoveryNotice(notice); }) : Promise.resolve();
    void prior.then(() => loadDocument(`${storageKey}:${source.id}`)).then(saved => {
      if (token !== generation.current) return;
      replace(saved ? rebaseDocument(saved, source) : createDocument(source));
      loaded.current = source.id; sourceStamp.current = stamp; setReady(true); setSaveError(false); setSaveStatus('Saved on this device');
    }).catch(error => {
      if (token !== generation.current) return;
      if (!loaded.current) { replace(createDocument(source)); loaded.current = source.id; }
      sourceStamp.current = stamp; setReady(true); setSaveError(true); setSaveStatus(`Could not open ${source.title}: ${error.message}. Your current canvas is kept.`);
    });
    return () => { generation.current++; };
  }, [source, busy, replace, storageKey]);
  useEffect(() => {
    if (!ready) return;
    setSaveStatus('Saving…');
    const timer = window.setTimeout(() => {
      const snapshot = document;
      void saveDocument(`${storageKey}:${snapshot.source.id}`, snapshot).then(() => { if (ref.current === snapshot) { setSaveError(false); setSaveStatus('Saved on this device'); } }).catch(error => { setSaveError(true); setSaveStatus(`Not saved: ${error.message}`); });
    }, 450);
    return () => clearTimeout(timer);
  }, [document, ready, storageKey, retry]);
  useEffect(() => {
    const flush = () => { if (loaded.current) void saveDocument(`${storageKey}:${ref.current.source.id}`, ref.current).catch(() => undefined); };
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); };
  }, [storageKey]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saveError || saveStatus === 'Saving…') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveError, saveStatus]);
  const change = useCallback((mutate: (overlay: Overlay) => Overlay) => {
    const h = commit(historyRef.current, mutate(historyRef.current.present));
    historyRef.current = h; setHistory(h);
    setDocument(current => ({ ...current, overlay: h.present, updatedAt: new Date().toISOString() }));
  }, []);
  const travel = useCallback((forward: boolean) => {
    const h = forward ? redo(historyRef.current) : undo(historyRef.current);
    historyRef.current = h; setHistory(h);
    setDocument(current => ({ ...current, overlay: h.present, updatedAt: new Date().toISOString() }));
  }, []);
  const view = useCallback((mutate: (view: ViewState) => ViewState) => setDocument(current => ({ ...current, view: mutate(current.view) })), []);
  const open = useCallback(async (next: CanvasDocument) => {
    const notice = await saveBeforeSwitch(storageKey, ref.current);
    if (notice) setRecoveryNotice(notice);
    // A recovered/imported document can be viewed until a new external source arrives.
    await loadDocument(`${storageKey}:${next.source.id}`);
    loaded.current = next.source.id; sourceStamp.current = JSON.stringify(source);
    replace(next); setReady(true);
  }, [replace, source, storageKey]);
  return { document, documentRef: ref, change, view, history, travel, ready, saveStatus, saveError, recoveryNotice, retrySave: () => setRetry(v => v + 1), open };
}
