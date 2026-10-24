import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { MAX_CHAT_FILE_BYTES } from "../src/lib/server/chat-store";
import {
  bridgeError,
  getLessonRequest,
  getLessonSchema,
  listLessonRequests,
  submitLesson,
} from "./operations";

const usage =
  "Usage: tsx mcp/bridge.ts list | get <id> | schema | submit <id> <revision> <lesson.json>";
const uuid = z.string().uuid();

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "list" && args.length === 0) return listLessonRequests();
  if (command === "schema" && args.length === 0) return getLessonSchema();
  if (command === "get" && args.length === 1)
    return getLessonRequest(uuid.parse(args[0]));
  if (command === "submit" && args.length === 3) {
    const [id, revision, filename] = args;
    uuid.parse(id);
    uuid.parse(revision);
    // Bound the explicit CLI input file; there is no arbitrary filesystem tool in MCP.
    if ((await stat(filename)).size > MAX_CHAT_FILE_BYTES)
      throw new Error("Lesson JSON exceeds the 1.5 MB submission limit.");
    let lesson: unknown;
    try {
      lesson = JSON.parse(await readFile(filename, "utf8"));
    } catch {
      throw new Error(
        "Read a UTF-8 file containing one Lesson JSON object, without Markdown fences.",
      );
    }
    return submitLesson(id, revision, lesson);
  }
  throw new Error(usage);
}

void main()
  .then((output) => {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  })
  .catch((error) => {
    const output =
      error instanceof Error &&
      (error.message === usage ||
        error.message.startsWith("Lesson JSON") ||
        error.message.startsWith("Read a UTF-8"))
        ? { code: "INVALID_CLI_INPUT", error: error.message }
        : bridgeError(error);
    process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 1;
  });
