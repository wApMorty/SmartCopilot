import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { jsonResult, memoryTypeSchema } from "./helpers.js";

export function registerMemoryWrite(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "memory_write",
    {
      title: "Save or update a memory",
      description:
        "Create or update a single memory (one fact per memory). Use it to persist decisions, reusable patterns, " +
        "gotchas, useful references or user preferences discovered while working — so the next session reuses them. " +
        "Writing to an existing name updates it (preserving its creation date). Link related memories in the body " +
        "with [[other-slug]]. When creating, the response lists near-duplicate memories worth reviewing.",
      inputSchema: {
        description: z
          .string()
          .min(1)
          .describe("One-line summary. Also used to derive the name when none is given."),
        body: z
          .string()
          .min(1)
          .describe("The fact, in markdown. Link related memories with [[other-slug]]."),
        name: z
          .string()
          .optional()
          .describe("Stable kebab-case slug. Omit to derive it from the description."),
        type: memoryTypeSchema
          .optional()
          .describe(
            "decision | pattern | gotcha | reference | preference | todo (default reference). " +
              "plan/task exist too but are managed via the task_* tools.",
          ),
        tags: z.array(z.string()).optional().describe("Lowercase, single-word tags."),
        source: z
          .enum(["auto", "manual"])
          .optional()
          .describe("Who authored it. Default 'auto' (the agent)."),
      },
    },
    async ({ description, body, name, type, tags, source }) => {
      const result = await store.write({ description, body, name, type, tags, source });
      return jsonResult({
        created: result.created,
        name: result.doc.name,
        path: result.doc.path,
        frontmatter: result.doc.frontmatter,
        links: result.doc.links,
        similar: result.similar,
      });
    },
  );
}
