import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { once } from "node:events";
import {
  createChatRequest,
  getChatRequest,
  cancelChatRequest,
} from "../src/lib/server/chat-store";
import type { Lesson } from "../src/lib/contracts";

const root = process.cwd();
const tsx = resolve(root, "node_modules/tsx/dist/cli.mjs");
type Rpc = {
  jsonrpc: string;
  id?: number;
  result?: any;
  error?: { code: number; message: string };
};

class ProtocolClient {
  child: ChildProcessWithoutNullStreams;
  messages: Rpc[] = [];
  stderr = "";
  sequence = 0;
  pending = new Map<
    number,
    { resolve: (message: Rpc) => void; reject: (error: Error) => void }
  >();
  failure: Error | null = null;
  constructor(directory: string) {
    this.child = spawn(
      process.execPath,
      [tsx, resolve(root, "mcp/server.ts")],
      {
        cwd: root,
        env: { ...process.env, SMRTR_BRIDGE_DIR: directory },
        stdio: "pipe",
      },
    );
    let buffer = "";
    this.child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      buffer += chunk;
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as Rpc;
          assert.equal(
            message.jsonrpc,
            "2.0",
            "stdout must contain only JSON-RPC",
          );
          this.messages.push(message);
          if (message.id !== undefined) {
            this.pending.get(message.id)?.resolve(message);
            this.pending.delete(message.id);
          }
        } catch {
          this.failure = new Error(
            `Non-protocol stdout: ${line.slice(0, 100)}`,
          );
        }
      }
    });
    this.child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-12000);
    });
    this.child.on("error", (error) => {
      this.failure = error;
    });
    this.child.on("exit", (code) => {
      for (const item of this.pending.values())
        item.reject(new Error(`MCP exited (${code}): ${this.stderr}`));
      this.pending.clear();
    });
  }
  request(method: string, params: Record<string, unknown> = {}): Promise<Rpc> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out: ${method}. ${this.stderr}`));
      }, 10000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      );
    });
  }
  notify(method: string) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }
  async call(name: string, args: Record<string, unknown> = {}) {
    const message = await this.request("tools/call", { name, arguments: args });
    assert.equal(message.error, undefined, JSON.stringify(message.error));
    return message.result;
  }
  async initialize() {
    const message = await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "smrtr-protocol-test", version: "1.0.0" },
    });
    assert.equal(message.error, undefined, JSON.stringify(message.error));
    assert.equal(message.result.serverInfo.name, "smrtr-local-lessons");
    this.notify("notifications/initialized");
    return message.result;
  }
  async close() {
    if (this.child.exitCode !== null) return;
    const exited = once(this.child, "exit");
    this.child.stdin.end();
    const timeout = setTimeout(() => this.child.kill("SIGTERM"), 2000);
    const [code] = await exited;
    clearTimeout(timeout);
    assert.equal(code, 0, this.stderr);
    assert.equal(this.failure, null);
  }
}

const notes =
  "Learn FIFO queues: people join at the back and leave from the front. Explain why arrival order matters.";
function candidate(): Lesson {
  const question = {
    conceptIds: ["fifo"],
    prompt: "Who leaves a FIFO queue first?",
    options: [
      { id: "first", text: "The earliest arrival" },
      { id: "last", text: "The latest arrival" },
    ],
    correctOptionIds: ["first"],
    explanation: "FIFO removes the earliest arrival still in the queue.",
  };
  return {
    id: "chat-authored-id",
    revision: "chat-authored-revision",
    mode: "generated",
    title: "Arrival order, made visible",
    summary: "Trace a FIFO queue from arrival to departure.",
    sources: [
      { id: "source-input", title: "Original study material", text: notes },
    ],
    concepts: [
      {
        id: "fifo",
        title: "First in, first out",
        summary: "Departure follows arrival order.",
        objective: "Predict which item leaves next.",
        sourceIds: ["source-input"],
      },
    ],
    relations: [],
    path: ["fifo"],
    modules: [
      {
        id: "module-fifo",
        conceptId: "fifo",
        explanation:
          "Enqueue at the back and dequeue at the front. Existing items keep their relative order.",
        example: "Generated example: Ada arrives, then Ben. Ada leaves first.",
        sourceIds: ["source-input"],
        activity: {
          kind: "concept",
          prompt: "Follow two arrivals.",
          steps: [
            { title: "Ada arrives", body: "Ada joins an empty queue." },
            {
              title: "Ben arrives",
              body: "Ben waits behind Ada; Ada remains at the front.",
            },
          ],
        },
        questions: [{ ...question, id: "q-fifo" }],
      },
    ],
    finalQuestions: [{ ...question, id: "final-fifo" }],
  };
}
function data(result: any) {
  return (
    result.structuredContent ??
    JSON.parse(result.content.find((item: any) => item.type === "text").text)
  );
}

test(
  "actual stdio initialize/list/get/schema/submit updates the shared validated store",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "smrtr-mcp-protocol-"));
    const request = await createChatRequest(
      { requestId: "protocol-browser-request", text: notes },
      { directory },
    );
    const client = new ProtocolClient(directory);
    try {
      const initialized = await client.initialize();
      assert.ok(initialized.capabilities.tools);
      assert.ok(initialized.capabilities.resources);
      const listed = await client.request("tools/list");
      assert.deepEqual(
        listed.result.tools.map((tool: any) => tool.name).sort(),
        ["get_lesson_request", "list_lesson_requests", "submit_lesson"],
      );
      assert.ok(
        listed.result.tools.find((tool: any) => tool.name === "submit_lesson")
          .inputSchema.properties.lesson.properties.modules,
      );
      const pending = data(await client.call("list_lesson_requests"));
      assert.equal(pending.requests.length, 1);
      assert.equal(pending.requests[0].id, request.id);
      assert.equal(
        pending.requests[0].text,
        undefined,
        "list only returns summaries",
      );
      const full = data(
        await client.call("get_lesson_request", { id: request.id }),
      );
      assert.equal(full.request.revision, request.revision);
      assert.match(full.materialTrust, /untrusted/);
      assert.ok(JSON.stringify(full).includes(notes));
      assert.ok(full.lessonSchema.properties.concepts);
      const resources = await client.request("resources/list");
      assert.equal(resources.result.resources[0].uri, "smrtr://schemas/lesson");
      const schema = await client.request("resources/read", {
        uri: "smrtr://schemas/lesson",
      });
      assert.ok(JSON.parse(schema.result.contents[0].text).properties.modules);
      const invalid = candidate();
      invalid.path = ["missing-concept"];
      const rejected = await client.call("submit_lesson", {
        id: request.id,
        revision: request.revision,
        lesson: invalid,
      });
      assert.equal(rejected.isError, true);
      assert.equal(
        (await getChatRequest(request.id, { directory })).state,
        "pending",
      );
      const submitted = await client.call("submit_lesson", {
        id: request.id,
        revision: request.revision,
        lesson: candidate(),
      });
      assert.notEqual(submitted.isError, true, JSON.stringify(submitted));
      assert.equal(data(submitted).state, "completed");
      const saved = await getChatRequest(request.id, { directory });
      assert.equal(saved.state, "completed");
      assert.equal(saved.lesson!.mode, "generated");
      assert.equal(saved.lesson!.sources[0].text, notes);
      assert.equal(saved.lesson!.revision, request.revision);
      assert.notEqual(saved.lesson!.id, "chat-authored-id");
      assert.equal(
        data(await client.call("list_lesson_requests")).requests.length,
        0,
      );
      const repeated = await client.call("submit_lesson", {
        id: request.id,
        revision: request.revision,
        lesson: candidate(),
      });
      assert.equal(repeated.isError, true, "completion cannot be overwritten");
      assert.ok(client.messages.length >= 10);
    } finally {
      await client.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "stdio tools reject stale, cancelled, malformed and unknown requests without writes",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "smrtr-mcp-rejection-"));
    const request = await createChatRequest({ text: notes }, { directory });
    const client = new ProtocolClient(directory);
    try {
      await client.initialize();
      const stale = await client.call("submit_lesson", {
        id: request.id,
        revision: "00000000-0000-4000-8000-000000000001",
        lesson: candidate(),
      });
      assert.equal(stale.isError, true);
      assert.equal(data(stale).code, "CHAT_REQUEST_STALE");
      assert.equal(
        (await getChatRequest(request.id, { directory })).state,
        "pending",
      );
      const malformed = await client.call("get_lesson_request", {
        id: "../../outside-store",
      });
      assert.equal(malformed.isError, true);
      const missing = await client.call("get_lesson_request", {
        id: "00000000-0000-4000-8000-000000000002",
      });
      assert.equal(missing.isError, true);
      assert.equal(data(missing).code, "CHAT_REQUEST_NOT_FOUND");
      await cancelChatRequest(request.id, { directory });
      const cancelled = await client.call("submit_lesson", {
        id: request.id,
        revision: request.revision,
        lesson: candidate(),
      });
      assert.equal(cancelled.isError, true);
      assert.equal(
        (await getChatRequest(request.id, { directory })).state,
        "cancelled",
      );
    } finally {
      await client.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "manual chat bridge uses the same request/schema/submission validation",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "smrtr-manual-bridge-"));
    const request = await createChatRequest({ text: notes }, { directory });
    const run = (args: string[]) =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
          const child = spawn(
            process.execPath,
            [tsx, "mcp/bridge.ts", ...args],
            {
              cwd: root,
              env: { ...process.env, SMRTR_BRIDGE_DIR: directory },
              stdio: "pipe",
            },
          );
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (chunk) => {
            stdout += chunk;
          });
          child.stderr.on("data", (chunk) => {
            stderr += chunk;
          });
          child.on("error", reject);
          child.on("exit", (code) => resolve({ code, stdout, stderr }));
        },
      );
    try {
      const listed = await run(["list"]);
      assert.equal(listed.code, 0);
      assert.equal(JSON.parse(listed.stdout).requests[0].id, request.id);
      const retrieved = await run(["get", request.id]);
      assert.equal(retrieved.code, 0, retrieved.stderr);
      assert.equal(
        JSON.parse(retrieved.stdout).request.revision,
        request.revision,
      );
      const schema = await run(["schema"]);
      assert.equal(schema.code, 0);
      assert.ok(JSON.parse(schema.stdout).properties.modules);
      const filename = join(directory, "lesson.json");
      await writeFile(filename, JSON.stringify(candidate()));
      const submitted = await run([
        "submit",
        request.id,
        request.revision,
        filename,
      ]);
      assert.equal(submitted.code, 0, submitted.stderr);
      assert.equal(JSON.parse(submitted.stdout).state, "completed");
      assert.equal(
        (await getChatRequest(request.id, { directory })).lesson!.sources[0]
          .text,
        notes,
      );
      const bad = await run(["get", "not-an-id"]);
      assert.equal(bad.code, 1);
      assert.equal(bad.stdout, "");
      assert.equal(JSON.parse(bad.stderr).code, "INVALID_ARGUMENTS");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
