import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { jsonResult, memoryTypeSchema } from "./helpers.js";

export function registerMemorySearch(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "memory_search",
    {
      title: "Search project memory",
      description:
        "Full-text search across the project's saved memory (decisions, patterns, gotchas, references, preferences). " +
        "Call this BEFORE exploring the code or making a non-trivial choice, to reuse what is already known and stay consistent. " +
        "Returns ranked memories with a short snippet — follow up with memory_read for the full content.",
      inputSchema: {
        query: z.string().min(1).describe("Keywords or a natural-language phrase."),
        type: memoryTypeSchema.optional().describe("Restrict results to one memory type."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Only memories carrying ALL of these tags."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of hits (default 10)."),
      },
    },
    async ({ query, type, tags, limit }) => {
      const hits = store.search(query, { type, tags, limit });
      return jsonResult({ query, count: hits.length, hits });
    },
  );
}
