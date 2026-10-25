"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Pause, Play, Square, X, Copy, ArrowRight } from "lucide-react";
import { EditableCanvas } from "@/components/canvas-editor/EditableCanvas";
import { parseCanvasSource, type CanvasSource } from "@/lib/canvas-document/source";
import { generateCanvas } from "@/lib/canvas-generation/stream";
import { generateChatCanvas } from "@/lib/canvas-generation/chat";
import { endLegacySource, generateLegacyCanvas } from "@/lib/canvas-generation/legacy";
import { failDraft, stopDraft, type GenerationDraft } from "@/lib/canvas-generation/reducer";
import { projectDraft } from "@/lib/canvas-generation/projection";
import { canvasFixture } from "@/lib/canvas-generation/fixtures";
import styles from "./generation.module.css";

type Mode = "simulated" | "chat" | "provider" | "legacy";
type ActiveRun = { token: string; controller: AbortController; chatId?: string };

export function ProgressiveCanvasWorkspace() {
  const [source, setSource] = useState<CanvasSource>();
  const [mode, setMode] = useState<Mode>("simulated");
  const [fixture, setFixture] = useState<"sorting" | "photosynthesis">("sorting");
  const [fault, setFault] = useState(false);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string>();
  const [chatId, setChatId] = useState<string>();
  const [chatPanel, setChatPanel] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef<ActiveRun | null>(null);
  const draftRef = useRef<GenerationDraft | null>(null);
  const latest = useRef<CanvasSource | undefined>(undefined);
  const pausedRef = useRef(false);
  const paint = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef("");

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => () => {
    active.current?.controller.abort();
    if (paint.current) clearTimeout(paint.current);
  }, []);

  function display(next: CanvasSource) {
    latest.current = parseCanvasSource(next);
    if (pausedRef.current) { setHasPending(true); return; }
    if (paint.current) return;
    paint.current = setTimeout(() => {
      paint.current = null;
      if (!pausedRef.current && latest.current) setSource(latest.current);
    }, 80);
  }
  function receiveDraft(draft: GenerationDraft, token: string) {
    if (active.current?.token !== token) return;
    draftRef.current = draft;
    const next = projectDraft(draft);
    if (next) display(next);
    const ready = Object.keys(draft.units).length;
    const count = draft.outline?.concepts.length;
    const prefix = draft.mode === "simulated" ? "Simulated · " : "";
    const message = draft.status === "complete" ? `${prefix}Map ready` : draft.status === "failed" ? "Could not create the map" : draft.status === "partial" ? `${prefix}${ready} explanations ready · some parts unfinished` : draft.status === "stopped" ? `${prefix}Stopped · your draft is kept` : count ? `${prefix}${ready} of ${count} explanations ready` : draft.mode === "chat" ? "Waiting for your connected chat" : `${prefix}Organizing your topic`;
    statusRef.current = message;
    if (!pausedRef.current) setStatus(message);
    if (draft.error) setError(draft.error);
    if (draft.terminal) setRunning(false);
  }
  function togglePause() {
    const next = !pausedRef.current;
    pausedRef.current = next; setPaused(next);
    if (next) setStatus("Updates paused · generation continues");
    else {
      if (latest.current) setSource(latest.current);
      setHasPending(false); setStatus(statusRef.current);
    }
  }
  function stop() {
    const run = active.current;
    if (!run) return;
    run.controller.abort();
    active.current = null;
    if (run.chatId) void fetch(`/api/canvas/chat/${encodeURIComponent(run.chatId)}`, { method: "DELETE" }).catch(() => undefined);
    if (draftRef.current) {
      const stopped = stopDraft(draftRef.current); draftRef.current = stopped;
      const next = projectDraft(stopped); if (next) display(next);
    } else if (latest.current) display(endLegacySource(latest.current, "stopped"));
    statusRef.current = "Stopped · your draft is kept";
    setStatus(pausedRef.current ? "Stopped · show updates to view the saved draft" : statusRef.current);
    setRunning(false);
  }
  async function start(event: FormEvent) {
    event.preventDefault();
    stop();
    if (paint.current) { clearTimeout(paint.current); paint.current = null; }
    const token = crypto.randomUUID();
    const controller = new AbortController();
    active.current = { token, controller };
    draftRef.current = null; latest.current = undefined;
    pausedRef.current = false; setPaused(false); setHasPending(false);
    setChatId(undefined); setChatPanel(false); setError(undefined); setCopyStatus("");
    setRunning(true); setOpen(false);
    statusRef.current = mode === "simulated" ? "Simulated · preparing the topic" : mode === "chat" ? "Connecting your chat request" : "Organizing your topic";
    setStatus(statusRef.current);
    const current = () => active.current?.token === token && !controller.signal.aborted;
    const receive = (draft: GenerationDraft) => receiveDraft(draft, token);
    try {
      if (mode === "chat") {
        await generateChatCanvas(token, text, controller.signal, receive, (id) => {
          if (!current()) { void fetch(`/api/canvas/chat/${id}`, { method: "DELETE" }); return; }
          active.current!.chatId = id; setChatId(id); setChatPanel(true);
        });
      } else if (mode === "legacy") {
        await generateLegacyCanvas({ requestId: token, text }, controller.signal, (next) => {
          if (!current()) return;
          display(next); statusRef.current = next.status === "complete" ? "Map ready" : `${next.nodes.filter((node) => node.role === "branch" && node.readiness === "ready").length} explanations ready`;
          if (!pausedRef.current) setStatus(statusRef.current);
        });
      } else {
        await generateCanvas({ requestId: token, text: mode === "simulated" ? canvasFixture(fixture).text : text, mode, fixture, fault: fault && mode === "simulated" ? "partial" : "none" }, controller.signal, receive);
      }
    } catch (cause) {
      if (!current()) return;
      const message = cause instanceof Error ? cause.message : "Could not finish this map. Your ready content is kept.";
      setError(message);
      if (draftRef.current) receive(failDraft(draftRef.current, message));
      else { const snapshot = latest.current as CanvasSource | undefined; if (snapshot) display(endLegacySource(snapshot, "partial")); }
      statusRef.current = latest.current ? "Connection ended · your partial map is kept" : "Could not create the map";
      if (!pausedRef.current) setStatus(statusRef.current);
    } finally {
      if (active.current?.token === token) { setRunning(false); active.current = null; }
    }
  }
  async function copyRequest() {
    if (!chatId) return;
    try {
      const response = await fetch(`/api/chat/requests/${chatId}/export`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not export this request.");
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopyStatus("Copied. Paste it into your connected coding chat.");
    } catch (cause) { setCopyStatus(cause instanceof Error ? cause.message : "Could not copy the request."); }
  }
  const toolbar = <div className={styles.toolbar}>
    <button className={styles.newTopic} onClick={() => setOpen(true)}><Plus size={15} />New topic</button>
    {status && <span className={styles.status} title={status}>{status}</span>}
    {(running || paused) && <button onClick={togglePause} aria-label={paused ? "Show incoming map updates" : "Pause incoming map updates"}>{paused ? <Play size={14} /> : <Pause size={14} />}<span>{paused ? hasPending ? "Show updates" : "Resume" : "Pause updates"}</span></button>}
    {running && <button onClick={stop}><Square size={12} />Stop</button>}
    {chatId && running && <button onClick={() => setChatPanel((value) => !value)} aria-expanded={chatPanel}>Chat request</button>}
    {error && <button className={styles.errorButton} onClick={() => setChatPanel((value) => !value)} aria-expanded={chatPanel}>View issue</button>}
  </div>;

  return <>
    <EditableCanvas source={source} storageKey="smrtr-editable-canvas-v1" toolbarSlot={toolbar} />
    <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{status}</p>
    {chatPanel && <aside className={styles.notice} aria-label={error ? "Generation issue" : "Connected chat request"}>
      <button className={styles.closeNotice} onClick={() => setChatPanel(false)} aria-label="Close generation details"><X size={16} /></button>
      {error ? <><strong>Some work could not finish</strong><p>{error}</p><button onClick={() => { setChatPanel(false); setOpen(true); }}>Try a new request <ArrowRight size={14} /></button></> : <><strong>Ready for your connected chat</strong><p>Ask your SMRTR-connected coding chat to open request <code>{chatId}</code> and submit the outline and each teaching unit as it is ready.</p><p>New content will appear here as the chat submits it. This page does not call a chat subscription automatically.</p><button onClick={copyRequest}><Copy size={14} />Copy request and schemas</button><small role="status">{copyStatus}</small></>}
    </aside>}
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <form onSubmit={start}>
        <div className={styles.dialogHeading}><div><span className={styles.eyebrow}>A new learning map</span><h2>Start with an idea.</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close new topic"><X size={18} /></button></div>
        <label htmlFor="canvas-generation-mode">Build with<select id="canvas-generation-mode" value={mode} onChange={(event) => setMode(event.target.value as Mode)}><option value="simulated">Simulated generation · no key needed</option><option value="chat">Your connected coding chat</option><option value="provider">Server generation · compact outline</option><option value="legacy">Server generation · existing full plan</option></select></label>
        {mode === "simulated" ? <>
          <label htmlFor="canvas-fixture-topic">Example topic<select id="canvas-fixture-topic" value={fixture} onChange={(event) => setFixture(event.target.value as typeof fixture)}><option value="sorting">Sorting · a collection becomes ordered</option><option value="photosynthesis">Photosynthesis · light becomes useful energy</option></select></label>
          <p className={styles.help}>A curated example arrives in stages to demonstrate the experience. No external model is called.</p>
          <details className={styles.testOptions}><summary>Try an interrupted result</summary><label><input type="checkbox" checked={fault} onChange={(event) => setFault(event.target.checked)} />Simulate one failed branch</label></details>
        </> : <><label htmlFor="canvas-topic">Topic or lecture notes<textarea id="canvas-topic" value={text} onChange={(event) => setText(event.target.value)} placeholder="An idea you want to understand, or notes from a lecture…" minLength={mode === "legacy" ? 10 : 2} maxLength={40000} required rows={5} /></label><p className={styles.help}>{mode === "chat" ? "Create a local request for your connected chat. Each validated submission will appear on this canvas." : "Uses the provider configured on this SMRTR server. New material appears only after it passes validation."}</p></>}
        <div className={styles.dialogFooter}><span>Your existing maps stay saved.</span><button className={styles.submit} type="submit">{mode === "simulated" ? "Try the live build" : mode === "chat" ? "Create chat request" : "Build my map"}<ArrowRight size={16} /></button></div>
      </form>
    </dialog>
  </>;
}
