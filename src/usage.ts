import { promises as fs } from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Local usage journal: one JSONL line per tool call, so we can see what the
 * agent actually calls (and what it ignores) and tune tool descriptions and
 * routing heuristics on real data instead of guesses.
 *
 * The journal is per-developer telemetry, never committed (`.smartcopilot/logs/`
 * is gitignored by `init`). Arguments are summarised — long strings truncated,
 * nested structures collapsed — so memory bodies never land in the log.
 */

export interface UsageEntry {
  /** ISO timestamp of when the call started. */
  ts: string;
  tool: string;
  /** Wall-clock duration of the handler. */
  ms: number;
  /** False when the tool returned `isError` or threw. */
  ok: boolean;
  args?: Record<string, unknown>;
  error?: string;
}

const MAX_STRING = 120;
const MAX_ARRAY = 8;

function summarizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}… [${value.length} chars]`
      : value;
  }
  if (Array.isArray(value)) {
    if (value.length <= MAX_ARRAY && value.every((v) => typeof v === "string")) {
      return value.map(summarizeValue);
    }
    return `[array of ${value.length}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{object: ${Object.keys(value).join(", ")}}`;
  }
  return value; // number | boolean | null | undefined
}

/** Collapse tool arguments to a log-safe shape (no bodies, no large payloads). */
export function summarizeArgs(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!args) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    out[key] = summarizeValue(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Where the journal lives. `SMARTCOPILOT_USAGE_LOG` overrides the path;
 * set it to `0`/`off`/`false` to disable logging entirely.
 */
export function resolveUsageLogFile(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | null {
  const override = env.SMARTCOPILOT_USAGE_LOG?.trim();
  if (override !== undefined && override !== "") {
    if (["0", "off", "false"].includes(override.toLowerCase())) return null;
    return path.resolve(cwd, override);
  }
  return path.resolve(cwd, ".smartcopilot", "logs", "tool-calls.jsonl");
}

export class UsageLog {
  /** Appends are chained so concurrent records never interleave lines. */
  private queue: Promise<unknown> = Promise.resolve();
  private warned = false;

  constructor(readonly file: string) {}

  /** Fire-and-forget append; logging must never fail or slow a tool call. */
  record(entry: UsageEntry): void {
    const line = `${JSON.stringify(entry)}\n`;
    this.queue = this.queue
      .then(() => fs.mkdir(path.dirname(this.file), { recursive: true }))
      .then(() => fs.appendFile(this.file, line, "utf8"))
      .catch((err) => {
        if (!this.warned) {
          this.warned = true;
          process.stderr.write(`[smartcopilot] usage log disabled: ${String(err)}\n`);
        }
      });
  }

  /** Wait for pending appends (shutdown and tests). */
  async flush(): Promise<void> {
    await this.queue.catch(() => undefined);
  }
}

type AnyToolHandler = (...handlerArgs: unknown[]) => Promise<{
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}>;

/**
 * Patch `server.registerTool` so every tool registered afterwards is timed and
 * journalled. Patching one seam beats threading the log through all ten tool
 * modules; call this before any `register*` in `createServer`.
 */
export function instrumentServer(server: McpServer, log: UsageLog): void {
  const original = server.registerTool.bind(server) as (
    name: string,
    config: unknown,
    handler: AnyToolHandler,
  ) => unknown;

  (server as { registerTool: unknown }).registerTool = (
    name: string,
    config: unknown,
    handler: AnyToolHandler,
  ) =>
    original(name, config, async (...handlerArgs: unknown[]) => {
      const started = Date.now();
      const base = {
        ts: new Date(started).toISOString(),
        tool: name,
        args: summarizeArgs(handlerArgs[0] as Record<string, unknown> | undefined),
      };
      try {
        const result = await handler(...handlerArgs);
        const ok = result?.isError !== true;
        log.record({
          ...base,
          ms: Date.now() - started,
          ok,
          ...(ok ? {} : { error: result?.content?.[0]?.text ?? "tool error" }),
        });
        return result;
      } catch (err) {
        log.record({ ...base, ms: Date.now() - started, ok: false, error: String(err) });
        throw err;
      }
    });
}
