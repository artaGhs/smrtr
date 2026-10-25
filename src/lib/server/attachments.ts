import { MAX_ATTACHMENT_BYTES, MAX_LEARNING_TEXT } from "../session/learning-input";
import { GenerationError } from "./errors";

export async function extractAttachment(file: File): Promise<{ name: string; text: string }> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new GenerationError("FILE_TOO_LARGE", "Choose a file smaller than 10 MB.", 413);
  if (!file.size) throw new GenerationError("EMPTY_FILE", "That file is empty. Try another file or paste your notes.", 422);
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text: string;
  try {
    if (["txt", "md", "csv"].includes(extension ?? "")) {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, "");
      if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new Error("Binary file");
    } else if (extension === "pdf") {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      try {
        if (pdf.numPages > 150) throw new GenerationError("TOO_MANY_PAGES", "Try a PDF with 150 pages or fewer, or just the chapter you need.", 413);
        text = (await extractText(pdf, { mergePages: true })).text;
      } finally { await pdf.loadingTask.destroy(); }
    } else if (extension === "docx") {
      const { extractRawText } = await import("mammoth");
      text = (await extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) })).value;
    } else {
      throw new GenerationError("UNSUPPORTED_FILE", "Add a PDF, Word document (.docx), or text file (.txt, .md, .csv).", 415);
    }
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("UNREADABLE_FILE", "We couldn’t read that file. Try an unlocked document with selectable text, or paste your notes.", 422);
  }
  text = text.trim();
  if (!/[\p{L}\p{N}]/u.test(text)) throw new GenerationError("NO_FILE_TEXT", "We couldn’t find readable text. For scanned notes, paste a transcription or try a document with selectable text.", 422);
  if (text.length > MAX_LEARNING_TEXT) throw new GenerationError("FILE_TEXT_TOO_LONG", "That document is longer than 40,000 characters. Try one chapter or a shorter set of notes.", 413);
  // Never interpret filenames or document content as HTML.
  return { name: file.name.replace(/[\r\n\x00]/g, " ").slice(0, 180), text };
}
