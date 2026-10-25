export const MAX_LEARNING_TEXT = 40_000;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;
export const ATTACHMENT_ACCEPT = ".pdf,.docx,.txt,.md,.csv,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export type LearningAttachment = { id: string; name: string; text: string };

/** Preserve the submitted material; never silently truncate a lecture. */
export function composeLearningInput(prompt: string, attachments: Pick<LearningAttachment, "name" | "text">[]) {
  const question = prompt.trim();
  if (!question && !attachments.length) throw new Error("Add a question or your lecture notes first.");
  const parts = [question ? (question.length < 10 ? `Help me understand ${question}.` : question) : "Help me understand the following lecture notes."];
  for (const attachment of attachments) {
    if (!attachment.text.trim()) throw new Error(`${attachment.name} has no readable text. Try another file or paste your notes.`);
    parts.push(`Attached lecture: ${attachment.name}\n${attachment.text}`);
  }
  const text = parts.join("\n\n");
  if (text.length > MAX_LEARNING_TEXT) throw new Error("That’s more than 40,000 characters. Try one chapter or a shorter set of notes.");
  return text;
}
