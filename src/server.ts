import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryStore } from "./memory/vault.js";
import { registerMemorySearch } from "./tools/memory_search.js";
import { registerMemoryRead } from "./tools/memory_read.js";
import { registerMemoryWrite } from "./tools/memory_write.js";
import { registerMemoryList } from "./tools/memory_list.js";
import { registerMemoryGraph } from "./tools/memory_graph.js";
import { registerMemoryDelete } from "./tools/memory_delete.js";
import { registerTaskPlan } from "./tools/task_plan.js";
import { registerTaskUpdate } from "./tools/task_update.js";
import { registerTaskList } from "./tools/task_list.js";
import { registerModelSuggest } from "./tools/model_suggest.js";
import { instrumentServer, type UsageLog } from "./usage.js";

export const SERVER_NAME = "smartcopilot";
export const SERVER_VERSION = "0.2.0";

/**
 * Build the MCP server and register every memory tool against `store`.
 * With a `usageLog`, every call is journalled (see src/usage.ts).
 */
export function createServer(store: MemoryStore, usageLog?: UsageLog): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  if (usageLog) instrumentServer(server, usageLog);

  registerMemorySearch(server, store);
  registerMemoryRead(server, store);
  registerMemoryWrite(server, store);
  registerMemoryList(server, store);
  registerMemoryGraph(server, store);
  registerMemoryDelete(server, store);
  registerTaskPlan(server, store);
  registerTaskUpdate(server, store);
  registerTaskList(server, store);
  registerModelSuggest(server, store);

  return server;
}
