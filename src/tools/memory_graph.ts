import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { jsonResult } from "./helpers.js";

export function registerMemoryGraph(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "memory_graph",
    {
      title: "Explore the memory graph",
      description:
        "Return the neighbourhood of a memory: outgoing [[links]], backlinks, and any broken links. " +
        "Use it to discover related context around a topic. Set depth=2 to also expand each neighbour's adjacency.",
      inputSchema: {
        name: z.string().min(1).describe("Memory name (slug) to centre the graph on."),
        depth: z
          .number()
          .int()
          .min(1)
          .max(2)
          .optional()
          .describe("1 = immediate neighbours (default), 2 = also their adjacency."),
      },
    },
    async ({ name, depth }) => {
      return jsonResult(store.graph(name, depth));
    },
  );
}
