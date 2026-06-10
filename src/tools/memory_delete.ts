import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { errorResult, jsonResult } from "./helpers.js";

export function registerMemoryDelete(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "memory_delete",
    {
      title: "Delete a memory",
      description:
        "Permanently remove a memory by name. Use this for facts that are wrong or obsolete. " +
        "The response lists memories that now have a broken link to the deleted one, so you can fix them.",
      inputSchema: {
        name: z.string().min(1).describe("Memory name (slug) to delete."),
      },
    },
    async ({ name }) => {
      const result = await store.delete(name);
      if (!result.deleted) return errorResult(`No memory named "${name}".`);
      return jsonResult({ deleted: true, name, nowBroken: result.nowBroken });
    },
  );
}
