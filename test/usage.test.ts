import { promises as fs } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { MemoryStore, makeTempVaultDir } from "../src/memory/vault.js";
import { createServer } from "../src/server.js";
import { aggregateUsage, formatUsageStats } from "../src/stats.js";
import { UsageLog, resolveUsageLogFile, summarizeArgs, type UsageEntry } from "../src/usage.js";

let vaultDir: string;
let logFile: string;
let usageLog: UsageLog;
let client: Client;

async function readEntries(): Promise<UsageEntry[]> {
  await usageLog.flush();
  const raw = await fs.readFile(logFile, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as UsageEntry);
}

beforeEach(async () => {
  vaultDir = await makeTempVaultDir();
  logFile = path.join(vaultDir, "..", "logs", "tool-calls.jsonl");
  const config: Config = { vaultDir, indexFile: path.join(vaultDir, "INDEX.md") };
  const store = new MemoryStore(config);
  await store.reload();

  usageLog = new UsageLog(logFile);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(store, usageLog);
  await server.connect(serverTransport);

  client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await fs.rm(vaultDir, { recursive: true, force: true });
  await fs.rm(path.dirname(logFile), { recursive: true, force: true });
});

describe("usage journal", () => {
  it("records one JSONL entry per tool call with summarised args", async () => {
    await client.callTool({
      name: "memory_write",
      arguments: {
        name: "decision-x",
        type: "decision",
        description: "Decision X",
        body: "We picked X over Y. ".repeat(30),
      },
    });
    await client.callTool({
      name: "memory_search",
      arguments: { query: "decision", tags: ["a", "b"] },
    });

    const entries = await readEntries();
    expect(entries.map((e) => e.tool)).toEqual(["memory_write", "memory_search"]);
    for (const entry of entries) {
      expect(entry.ok).toBe(true);
      expect(entry.ms).toBeTypeOf("number");
      expect(Date.parse(entry.ts)).not.toBeNaN();
    }
    // Long content is truncated, small fields kept verbatim.
    const writeArgs = entries[0]!.args as Record<string, unknown>;
    expect(writeArgs.name).toBe("decision-x");
    expect(String(writeArgs.body)).toMatch(/… \[\d+ chars\]$/);
    expect((entries[1]!.args as Record<string, unknown>).tags).toEqual(["a", "b"]);
  });

  it("flags failed calls with ok=false and the error text", async () => {
    await client.callTool({ name: "memory_read", arguments: { target: "nope" } });
    const entries = await readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(false);
    expect(entries[0]!.error).toContain("nope");
  });
});

describe("summarizeArgs", () => {
  it("collapses nested structures and long arrays", () => {
    const out = summarizeArgs({
      n: 3,
      flag: true,
      obj: { a: 1, b: 2 },
      many: Array.from({ length: 20 }, (_, i) => `t${i}`),
      skip: undefined,
    })!;
    expect(out.n).toBe(3);
    expect(out.flag).toBe(true);
    expect(out.obj).toBe("{object: a, b}");
    expect(out.many).toBe("[array of 20]");
    expect("skip" in out).toBe(false);
  });
});

describe("resolveUsageLogFile", () => {
  it("defaults under .smartcopilot/logs, honours overrides, supports off", () => {
    expect(resolveUsageLogFile({}, "/tmp/proj")).toBe(
      path.join("/tmp/proj", ".smartcopilot", "logs", "tool-calls.jsonl"),
    );
    expect(resolveUsageLogFile({ SMARTCOPILOT_USAGE_LOG: "elsewhere.jsonl" }, "/tmp/proj")).toBe(
      path.join("/tmp/proj", "elsewhere.jsonl"),
    );
    expect(resolveUsageLogFile({ SMARTCOPILOT_USAGE_LOG: "off" }, "/tmp/proj")).toBeNull();
    expect(resolveUsageLogFile({ SMARTCOPILOT_USAGE_LOG: "0" }, "/tmp/proj")).toBeNull();
  });
});

describe("usage stats", () => {
  it("aggregates calls, errors and timings per tool", () => {
    const jsonl = [
      JSON.stringify({ ts: "2026-06-10T10:00:00Z", tool: "memory_search", ms: 4, ok: true }),
      JSON.stringify({ ts: "2026-06-10T10:01:00Z", tool: "memory_search", ms: 10, ok: false, error: "x" }),
      JSON.stringify({ ts: "2026-06-10T09:00:00Z", tool: "memory_write", ms: 7, ok: true }),
      "not json",
    ].join("\n");

    const stats = aggregateUsage(jsonl);
    expect(stats.total).toBe(3);
    expect(stats.malformed).toBe(1);
    expect(stats.first).toBe("2026-06-10T09:00:00Z");
    expect(stats.last).toBe("2026-06-10T10:01:00Z");
    expect(stats.tools[0]).toMatchObject({ tool: "memory_search", calls: 2, errors: 1, msMax: 10 });

    const report = formatUsageStats(stats, "log.jsonl");
    expect(report).toContain("3 tool calls");
    expect(report).toContain("memory_search");
    expect(report).toContain("1 malformed");
  });

  it("handles an empty journal", () => {
    const report = formatUsageStats(aggregateUsage(""), "log.jsonl");
    expect(report).toContain("No tool calls recorded yet");
  });
});
