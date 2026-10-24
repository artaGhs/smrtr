import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { once } from "node:events";
import {
  createChatRequest,
  getChatRequest,
  cancelChatRequest,
} from "../src/lib/server/chat-store";
import type { Lesson, LearnerProfile } from "../src/lib/contracts";

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
    const guard = join(directory, "no-model-calls.mjs");
    writeFileSync(
      guard,
      'globalThis.fetch = async () => { process.stderr.write("SMRTR_TEST_MODEL_CALL\\n"); throw new Error("MCP bridge must not invoke a model or fetch remote content"); };',
    );
    this.child = spawn(
      process.execPath,
      ["--import", guard, tsx, resolve(root, "mcp/server.ts")],
      {
        cwd: directory,
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
    assert.doesNotMatch(
      this.stderr,
      /SMRTR_TEST_MODEL_CALL/,
      "MCP tools must not invoke a model or fetch content",
    );
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
    teachingPlan: {
      openingQuestion: "Who should leave the service counter first?",
      bigPicture:
        "Follow two arrivals through one queue, then explain why the earlier arrival leaves first.",
      sequence: [
        {
          conceptId: "fifo",
          approach: "example",
          purpose: "Trace arrival and departure order in one coherent example.",
        },
      ],
    },
    learningDesign: {
      centralQuestion: "Who should leave the service counter first?",
      objective: "Predict departure order from the order people arrive.",
      assumedKnowledge: ["People can wait in an ordered line."],
      scenario: {
        id: "counter-example",
        title: "Two arrivals, one service counter",
        description:
          "Generated example: Ada arrives at a service counter before Ben. Both wait for one clerk.",
        entities: [
          { id: "ada", label: "Ada", role: "Earliest arrival" },
          { id: "ben", label: "Ben", role: "Later arrival" },
        ],
        activityConceptId: null,
        activity: null,
      },
      pages: [
        {
          id: "overview",
          title: "A service counter",
          question: "Who should the clerk serve first?",
          purpose:
            "Establish the two-arrival scenario before introducing queue rules.",
          kind: "overview",
          parentId: null,
          conceptIds: ["fifo"],
          sourceIds: ["source-input"],
          topicIds: [],
          blocks: [
            {
              id: "overview-block",
              kind: "paragraph",
              segments: [
                {
                  kind: "text",
                  text: "Ada arrives before Ben. One clerk serves one person at a time.",
                },
                {
                  kind: "page-link",
                  text: "Follow the queue",
                  pageId: "core-queue",
                  reason: "Use the same arrivals to make the next prediction.",
                },
              ],
            },
          ],
          scene: "explanation",
          activityConceptId: null,
          recommendedNextPageId: "core-queue",
        },
        {
          id: "core-queue",
          title: "Follow arrival order",
          question: "Why does Ada leave before Ben?",
          purpose: "Apply the FIFO rule to this same waiting line.",
          kind: "core",
          parentId: "overview",
          conceptIds: ["fifo"],
          sourceIds: ["source-input"],
          topicIds: [],
          blocks: [
            {
              id: "core-block",
              kind: "paragraph",
              segments: [
                {
                  kind: "text",
                  text: "The earliest arrival still waiting is at the front.",
                },
                {
                  kind: "page-link",
                  text: "What is a queue?",
                  pageId: "support-queue",
                  reason:
                    "Review the waiting-line model without changing the example.",
                },
              ],
            },
          ],
          scene: "explanation",
          activityConceptId: null,
          recommendedNextPageId: null,
        },
        {
          id: "support-queue",
          title: "A queue",
          question: "What makes this an ordered queue?",
          purpose: "Explain how the front and back preserve arrival order.",
          kind: "support",
          parentId: "core-queue",
          conceptIds: ["fifo"],
          sourceIds: ["source-input"],
          topicIds: [],
          blocks: [
            {
              id: "queue-support-block",
              kind: "paragraph",
              segments: [
                {
                  kind: "text",
                  text: "New people join behind those already waiting.",
                },
                {
                  kind: "page-link",
                  text: "First in, first out",
                  pageId: "support-fifo",
                  reason:
                    "Unpack the phrase using Ada and Ben from the same counter.",
                },
              ],
            },
          ],
          scene: "explanation",
          activityConceptId: null,
          recommendedNextPageId: null,
        },
        {
          id: "support-fifo",
          title: "First in, first out",
          question: "What does first in, first out mean here?",
          purpose: "Connect the FIFO phrase to Ada arriving before Ben.",
          kind: "support",
          parentId: "support-queue",
          conceptIds: ["fifo"],
          sourceIds: ["source-input"],
          topicIds: [],
          blocks: [
            {
              id: "fifo-support-block",
              kind: "paragraph",
              segments: [
                {
                  kind: "text",
                  text: "Ada is first in the line, so Ada is the first to leave for service.",
                },
              ],
            },
          ],
          scene: "none",
          activityConceptId: null,
          recommendedNextPageId: null,
        },
      ],
      sequence: [
        {
          pageId: "overview",
          purpose: "Ground the lesson in a concrete two-arrival scenario.",
          whyNext:
            "A visible waiting line makes the abstract rule easier to follow.",
        },
        {
          pageId: "core-queue",
          purpose: "Use the scenario to reason about FIFO departure order.",
          whyNext:
            "After predicting the next departure, check the explanation.",
        },
      ],
      routes: {
        new: ["overview", "core-queue"],
        recognize: ["overview", "core-queue"],
        explain: ["core-queue"],
        apply: ["core-queue"],
      },
    },
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
      const fullResult = await client.call("get_lesson_request", {
        id: request.id,
      });
      assert.notEqual(fullResult.isError, true, JSON.stringify(fullResult));
      const full = data(fullResult);
      assert.equal(full.request.revision, request.revision);
      assert.match(full.materialTrust, /untrusted/);
      assert.equal(full.untrustedInput.text, notes);
      assert.equal(full.requiredMetadata.revision, request.revision);
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
      assert.equal(saved.lesson!.origin, "chat");
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
  "stdio tools reject stale, expired, cancelled, malformed and unknown requests without writes",
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
      const expired = await createChatRequest(
        { text: notes },
        {
          directory,
          now: () => new Date(Date.now() - 25 * 60 * 60 * 1000),
        },
      );
      assert.equal(
        data(await client.call("list_lesson_requests")).requests.length,
        1,
      );
      const expiredGet = await client.call("get_lesson_request", {
        id: expired.id,
      });
      assert.equal(expiredGet.isError, true);
      assert.equal(data(expiredGet).code, "CHAT_REQUEST_STALE");
      const expiredSubmit = await client.call("submit_lesson", {
        id: expired.id,
        revision: expired.revision,
        lesson: candidate(),
      });
      assert.equal(expiredSubmit.isError, true);
      assert.equal(data(expiredSubmit).code, "CHAT_REQUEST_STALE");
      assert.equal(
        (await getChatRequest(expired.id, { directory })).state,
        "pending",
      );
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

test(
  "MCP submission replaces model-authored BFS answer keys using the actual graph",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "smrtr-mcp-bfs-"));
    const text =
      "Teach BFS breadth-first search with alphabetical neighbors, a FIFO queue, and visited on enqueue.";
    const request = await createChatRequest({ text }, { directory });
    const lesson = candidate();
    lesson.concepts[0] = {
      ...lesson.concepts[0],
      title: "Breadth-first search",
      summary: "Explore reachable nodes in layers.",
      objective: "Trace the FIFO queue to find fewest-edge paths.",
    };
    lesson.modules[0].activity = {
      kind: "bfs",
      nodes: ["S", "A", "B", "C", "T", "U"],
      directed: true,
      start: "S",
      neighborOrder: "alphabetical",
      visitedOn: "enqueue",
      edges: [
        { source: "S", target: "B" },
        { source: "S", target: "A" },
        { source: "A", target: "C" },
        { source: "B", target: "T" },
        { source: "C", target: "T" },
      ],
    };
    lesson.modules[0].questions[0].correctOptionIds = ["last"];
    lesson.learningDesign!.scenario = {
      id: "delivery-network",
      title: "One parcel delivery network",
      description:
        "Generated example: a parcel starts at S and follows one-way unweighted roads to reach connected destinations. U is isolated.",
      entities: lesson.modules[0].activity.nodes.map((id) => ({
        id,
        label: id,
        role: id === "S" ? "Start depot" : "Destination",
      })),
      activityConceptId: "fifo",
      activity: lesson.modules[0].activity,
    };
    lesson.learningDesign!.pages = lesson.learningDesign!.pages.map(
      (page, index) => ({
        ...page,
        scene: index === 0 ? "scenario" : "queue",
        activityConceptId: "fifo",
      }),
    );
    const client = new ProtocolClient(directory);
    try {
      await client.initialize();
      const submitted = await client.call("submit_lesson", {
        id: request.id,
        revision: request.revision,
        lesson,
      });
      assert.notEqual(submitted.isError, true, JSON.stringify(submitted));
      const saved = (await getChatRequest(request.id, { directory })).lesson!;
      const traversal = saved.modules[0].questions[0];
      assert.equal(
        traversal.options.find((option) =>
          traversal.correctOptionIds.includes(option.id),
        )!.text,
        "S, A, B, C, T",
      );
      assert.equal(
        saved.finalQuestions[0].options.find((option) =>
          saved.finalQuestions[0].correctOptionIds.includes(option.id),
        )!.text,
        "Unreachable from the start",
      );
      assert.equal(saved.sources[0].text, text);
      assert.equal(saved.origin, "chat");
    } finally {
      await client.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "MCP exports immutable confidence and hierarchy context and rejects profile replacement",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "smrtr-mcp-profile-"));
    const contexts: string[] = [];
    try {
      for (const overall of ["new", "apply"] as const) {
        const profile: LearnerProfile = {
          overall,
          topics: [
            { id: "queue-topic", label: "Queues", level: null },
            { id: "fifo-topic", label: "FIFO order", level: "recognize" },
          ],
        };
        const expected = structuredClone(profile);
        const request = await createChatRequest(
          { text: notes, learnerProfile: profile },
          { directory },
        );
        profile.overall = overall === "new" ? "apply" : "new";
        profile.topics[0].level = "apply";
        const client = new ProtocolClient(directory);
        try {
          await client.initialize();
          const exported = data(
            await client.call("get_lesson_request", { id: request.id }),
          );
          assert.deepEqual(exported.learnerProfile, expected);
          assert.deepEqual(exported.request.learnerProfile, expected);
          assert.deepEqual(exported.requiredMetadata.learnerProfile, expected);
          assert.equal(exported.designRequired, true);
          assert.ok(
            exported.lessonSchema.properties.learningDesign.properties.pages,
          );
          assert.ok(
            exported.lessonSchema.properties.learnerProfile.properties.topics,
          );
          contexts.push(exported.confidenceGuidance);
          const missing = candidate();
          delete missing.learningDesign;
          const rejected = await client.call("submit_lesson", {
            id: request.id,
            revision: request.revision,
            lesson: missing,
          });
          assert.equal(rejected.isError, true);
          assert.equal(data(rejected).code, "INVALID_CHAT_LESSON");
          const lesson = candidate();
          lesson.learnerProfile = {
            overall: overall === "new" ? "apply" : "new",
            topics: [],
          };
          const submitted = await client.call("submit_lesson", {
            id: request.id,
            revision: request.revision,
            lesson,
          });
          assert.notEqual(submitted.isError, true, JSON.stringify(submitted));
          const saved = await getChatRequest(request.id, { directory });
          assert.deepEqual(saved.learnerProfile, expected);
          assert.deepEqual(saved.lesson!.learnerProfile, expected);
          assert.equal(
            saved.lesson!.learningDesign!.pages.find(
              (page) => page.id === "support-fifo",
            )!.parentId,
            "support-queue",
          );
          assert.equal(
            saved.lesson!.learningDesign!.pages.find(
              (page) => page.id === "support-queue",
            )!.parentId,
            "core-queue",
          );
          assert.deepEqual(saved.lesson!.learningDesign!.routes.new, [
            "overview",
            "core-queue",
          ]);
          assert.deepEqual(saved.lesson!.learningDesign!.routes.apply, [
            "core-queue",
          ]);
        } finally {
          await client.close();
        }
      }
      assert.equal(contexts.length, 2);
      assert.notEqual(
        contexts[0],
        contexts[1],
        "self-reported confidence changes teaching guidance",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "MCP still fulfills stored v1 requests without authored profile or hierarchy metadata",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "smrtr-mcp-legacy-"));
    const created = await createChatRequest({ text: notes }, { directory });
    const legacy = {
      ...created,
      version: 1,
      learnerProfile: undefined,
      designRequired: undefined,
    };
    await writeFile(
      join(directory, `${created.id}.json`),
      JSON.stringify(legacy),
    );
    const client = new ProtocolClient(directory);
    try {
      await client.initialize();
      const exported = data(
        await client.call("get_lesson_request", { id: created.id }),
      );
      assert.equal(exported.designRequired, false);
      assert.deepEqual(exported.learnerProfile, { overall: "new", topics: [] });
      const lesson = candidate();
      delete lesson.learningDesign;
      delete lesson.teachingPlan;
      const submitted = await client.call("submit_lesson", {
        id: created.id,
        revision: created.revision,
        lesson,
      });
      assert.notEqual(submitted.isError, true, JSON.stringify(submitted));
      assert.equal(
        (await getChatRequest(created.id, { directory })).state,
        "completed",
      );
    } finally {
      await client.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
