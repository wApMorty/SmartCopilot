import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { jsonResult, memoryTypeSchema } from "./helpers.js";

export function registerMemoryList(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "memory_list",
    {
      title: "List memories",
      description:
        "List memories (most-recently-updated first), optionally filtered by type or a single tag. " +
        "Use it to get an overview of what the project knows; use memory_search when you have a query.",
      inputSchema: {
        type: memoryTypeSchema.optional().describe("Restrict to one memory type."),
        tag: z.string().optional().describe("Restrict to memories carrying this tag."),
        limit: z.number().int().min(1).max(200).optional().describe("Maximum entries (default all)."),
      },
    },
    async ({ type, tag, limit }) => {
      const docs = store.list({ type, tag, limit });
      return jsonResult({
        count: docs.length,
        memories: docs.map((d) => ({
          name: d.name,
          description: d.frontmatter.description,
          type: d.frontmatter.type,
          tags: d.frontmatter.tags,
          updated: d.frontmatter.updated,
        })),
      });
    },
  );
}
