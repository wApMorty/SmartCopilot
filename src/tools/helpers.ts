import { z } from "zod";
import { MEMORY_TYPES, type MemoryType } from "../types.js";

/** Zod enum over the memory types, reused by several tool schemas. */
export const memoryTypeSchema = z.enum(
  [...MEMORY_TYPES] as [MemoryType, ...MemoryType[]],
);

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function jsonResult(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
