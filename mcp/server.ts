import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createSmrtrMcpServer } from "./tools";

// stdout belongs exclusively to the MCP JSON-RPC transport.
const handle = serveStdio(createSmrtrMcpServer, {
  onerror: () =>
    console.error(
      "SMRTR MCP transport error. Check the client connection and local server configuration.",
    ),
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void handle.close().finally(() => process.exit(0));
  });
}
