import assert from "node:assert/strict";
import test from "node:test";
import { extractAttachment } from "./attachments";
import { GenerationError } from "./errors";

test("lecture text is preserved as data, with no HTML execution or silent shortening", async () => {
  const text = "F = −kx\n<script>not executable</script>\nA restoring force opposes displacement.";
  assert.deepEqual(await extractAttachment(new File([text], "lecture.md")), { name: "lecture.md", text });
  await assert.rejects(extractAttachment(new File(["x".repeat(40_001)], "lecture.txt")), (error: unknown) => error instanceof GenerationError && error.code === "FILE_TEXT_TOO_LONG");
});

test("empty, binary, corrupt and unsupported uploads return clear errors", async () => {
  for (const [file, code] of [
    [new File([], "empty.txt"), "EMPTY_FILE"],
    [new File([new Uint8Array([0,1,2,3])], "binary.txt"), "UNREADABLE_FILE"],
    [new File(["not a real PDF"], "broken.pdf"), "UNREADABLE_FILE"],
    [new File(["not a Word file"], "broken.docx"), "UNREADABLE_FILE"],
    [new File(["anything"], "notes.exe"), "UNSUPPORTED_FILE"],
    [new File(["    "], "blank.txt"), "NO_FILE_TEXT"],
  ] as const) await assert.rejects(extractAttachment(file), (error: unknown) => error instanceof GenerationError && error.code === code);
});
