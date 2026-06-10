import { promises as fs } from "node:fs";
import type { UsageEntry } from "./usage.js";

/**
 * `smartcopilot-mcp stats` — aggregate the usage journal so a dogfooding pass
 * can answer "what does the agent actually call?" without spelunking JSONL.
 */

export interface ToolUsage {
  tool: string;
  calls: number;
  errors: number;
  msTotal: number;
  msMax: number;
}

export interface UsageStats {
  total: number;
  malformed: number;
  first?: string;
  last?: string;
  tools: ToolUsage[];
}

export function aggregateUsage(jsonl: string): UsageStats {
  const byTool = new Map<string, ToolUsage>();
  let total = 0;
  let malformed = 0;
  let first: string | undefined;
  let last: string | undefined;

  for (const line of jsonl.split("\n")) {
    if (line.trim() === "") continue;
    let entry: UsageEntry;
    try {
      entry = JSON.parse(line) as UsageEntry;
      if (typeof entry.tool !== "string") throw new Error("missing tool");
    } catch {
      malformed += 1;
      continue;
    }
    total += 1;
    if (first === undefined || entry.ts < first) first = entry.ts;
    if (last === undefined || entry.ts > last) last = entry.ts;
    const usage = byTool.get(entry.tool) ?? {
      tool: entry.tool,
      calls: 0,
      errors: 0,
      msTotal: 0,
      msMax: 0,
    };
    usage.calls += 1;
    if (!entry.ok) usage.errors += 1;
    usage.msTotal += entry.ms ?? 0;
    usage.msMax = Math.max(usage.msMax, entry.ms ?? 0);
    byTool.set(entry.tool, usage);
  }

  const tools = [...byTool.values()].sort((a, b) => b.calls - a.calls);
  return { total, malformed, first, last, tools };
}

export function formatUsageStats(stats: UsageStats, file: string): string {
  if (stats.total === 0) {
    return `No tool calls recorded yet in ${file}.\nUse Copilot with the smartcopilot server enabled, then re-run stats.`;
  }
  const lines = [
    `Usage journal: ${file}`,
    `${stats.total} tool calls between ${stats.first} and ${stats.last}` +
      (stats.malformed > 0 ? ` (${stats.malformed} malformed lines skipped)` : ""),
    "",
    `${"tool".padEnd(16)} ${"calls".padStart(6)} ${"errors".padStart(7)} ${"avg ms".padStart(7)} ${"max ms".padStart(7)}`,
  ];
  for (const t of stats.tools) {
    lines.push(
      `${t.tool.padEnd(16)} ${String(t.calls).padStart(6)} ${String(t.errors).padStart(7)} ` +
        `${String(Math.round(t.msTotal / t.calls)).padStart(7)} ${String(t.msMax).padStart(7)}`,
    );
  }
  return lines.join("\n");
}

/** Read + aggregate + format; tolerates a missing journal. */
export async function usageStatsReport(file: string): Promise<string> {
  let jsonl: string;
  try {
    jsonl = await fs.readFile(file, "utf8");
  } catch {
    return `No usage journal found at ${file}.\nIt is created on the first tool call (set SMARTCOPILOT_USAGE_LOG to change or disable it).`;
  }
  return formatUsageStats(aggregateUsage(jsonl), file);
}
