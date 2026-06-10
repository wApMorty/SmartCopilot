import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { errorResult, jsonResult } from "./helpers.js";

export function registerMemoryRead(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "memory_read",
    {
      title: "Read a memory",
      description:
        "Read one memory in full by its name (slug) or file path. Returns the frontmatter, the body, " +
        "its outgoing [[links]] (with any broken ones flagged) and its backlinks — so you can traverse the graph.",
      inputSchema: {
        target: z.string().min(1).describe("Memory name (slug) or file path."),
      },
    },
    async ({ target }) => {
      const doc = store.resolve(target);
      if (!doc) return errorResult(`No memory found for "${target}".`);
      const graph = store.graph(doc.name);
      return jsonResult({
        name: doc.name,
        path: doc.path,
        frontmatter: doc.frontmatter,
        body: doc.body,
        outgoing: graph.outgoing,
        broken: graph.broken,
        backlinks: graph.backlinks,
      });
    },
  );
}
