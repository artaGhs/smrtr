import { useState, type FormEvent } from "react";
import { Check, CheckCircle2, ChevronDown, Copy, LoaderCircle, MessageSquare, Upload } from "lucide-react";
import type { StudyWorkspaceProps } from "@/lib/contracts";

type ChatHandoffProps = Pick<StudyWorkspaceProps, "chatRequest" | "status" | "onCopyChatRequest" | "onImportChatLesson">;

export function ChatHandoff({ chatRequest, status, onCopyChatRequest, onImportChatLesson }: ChatHandoffProps) {
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!chatRequest) return null;
  const complete = chatRequest.status === "completed";
  const waiting = chatRequest.status === "waiting" && status === "generating";

  async function copyRequest() {
    setMessage(null);
    try {
      await onCopyChatRequest();
      setCopied(true);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The request could not be copied. Try again or use its ID with your local MCP connection.");
    }
  }

  async function importLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImporting(true);
    setMessage(null);
    try {
      await onImportChatLesson(json);
      setJson("");
      setMessage("Lesson validated and loaded.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The lesson could not be imported. Check that you pasted the complete JSON response.");
    } finally {
      setImporting(false);
    }
  }

  return <section className={`chat-handoff ${complete ? "chat-complete" : ""}`} aria-label="Your chat request">
    <div className="handoff-heading" role="status"><span className="handoff-icon">{complete ? <CheckCircle2 size={18} /> : <MessageSquare size={18} />}</span><div><strong>{complete ? "Your chat lesson is ready." : waiting ? "Waiting for your chat." : chatRequest.status === "error" ? "Your chat request needs attention." : "Your request is ready. Waiting is paused."}</strong><span>{complete ? "Validated and connected to your study map." : "The website does not call your chat subscription automatically."}</span></div>{waiting && <LoaderCircle size={16} className="spin" aria-label="Waiting for submitted lesson" />}</div>
    <div className="request-reference"><span>REQUEST ID</span><code>{chatRequest.id}</code></div>
    {!complete && <>
      <ol className="handoff-steps"><li><strong>Take the request to your chat.</strong><span>Copy the notes, lesson format, and instructions into the LLM chat you already use.</span></li><li><strong>Ask your chat to create the lesson.</strong><span>If its local SMRTR MCP connection is configured, ask it to read and submit this request ID. Otherwise, ask it to return the lesson JSON.</span></li><li><strong>Bring the lesson back.</strong><span>{waiting ? "This page is checking for a submitted lesson. " : "Create a new request above to start checking again. "}You can also paste the JSON below.</span></li></ol>
      <button className="secondary-button copy-request" onClick={copyRequest}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Request copied · copy again" : "Copy request for my chat"}</button>
    </>}
    <details className="mcp-guide"><summary>About connecting a chat with MCP<ChevronDown size={14} /></summary><p>SMRTR includes a local MCP bridge. A compatible chat client must be configured to launch it on the same computer as this app. A chat subscription alone does not establish this connection.</p><p>The server runs from this project with <code>npm run mcp</code>. Follow the <a href="https://github.com/artaGhs/smrtr#readme" target="_blank" rel="noopener noreferrer">repository’s setup instructions<ChevronDown size={11} /></a> for your client. Once connected, give the chat the request ID above. The bridge reads your request and submits a lesson; your chat writes the teaching content.</p><p>You can use the copy-and-import route without connecting MCP.</p></details>
    {!complete && <details className="import-details"><summary><Upload size={14} />Paste a lesson from my chat<ChevronDown size={14} /></summary><form onSubmit={importLesson}><label htmlFor={`chat-import-${chatRequest.id}`}>Lesson JSON</label><textarea id={`chat-import-${chatRequest.id}`} value={json} onChange={(event) => setJson(event.target.value)} placeholder="Paste the complete lesson JSON returned by your chat…" spellCheck={false} aria-describedby="chat-import-help" /><p id="chat-import-help">The lesson is validated before it replaces your map. Preserve the request revision from the copied instructions and keep the full JSON, including concepts, modules, sources, and questions.</p><button className="primary-button" type="submit" disabled={!json.trim() || importing}>{importing ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}{importing ? "Validating lesson…" : "Import and validate lesson"}</button></form></details>}
    {message && <p className="handoff-message" role="status">{message}</p>}
  </section>;
}
