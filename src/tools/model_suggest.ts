import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { jsonResult } from "./helpers.js";

export const HEURISTICS_MEMORY = "model-routing-heuristics";

const TIERS = ["eco", "standard", "frontier"] as const;
type Tier = (typeof TIERS)[number];

/**
 * Seed body for the heuristics memory. Markdown tables so the user can tune it
 * by hand; `model_suggest` re-parses it on every call (the watcher keeps the
 * vault fresh). Model names must match the user's Copilot model picker.
 */
const DEFAULT_HEURISTICS_BODY = `Maps task types to model tiers for cost-aware routing. Edit freely: \`model_suggest\`
re-reads this memory on every call. Tier escalates one step when risk is high or size is
large. Model names must match your Copilot model picker.

## Task types

| task type | tier |
|-----------|------|
| exploration | eco |
| summarisation | eco |
| documentation | eco |
| classification | eco |
| implementation | standard |
| tests | standard |
| review | standard |
| architecture | frontier |
| cross-cutting-refactor | frontier |
| hard-debugging | frontier |

## Tiers

| tier | model |
|------|-------|
| eco | Claude Haiku 4.5 |
| standard | Claude Sonnet 4.6 |
| frontier | GPT-5.4 |
`;

/** Parse `| a | b |` rows into pairs, skipping header/separator rows. */
function parseTableRows(body: string): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const line of body.split("\n")) {
    const cells = line
      .trim()
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length !== 2) continue;
    if (cells.some((c) => /^[-: ]+$/.test(c))) continue; // separator row
    rows.push([cells[0]!.toLowerCase(), cells[1]!]);
  }
  return rows;
}

interface Heuristics {
  taskTypes: Map<string, Tier>;
  models: Map<Tier, string>;
}

function parseHeuristics(body: string): Heuristics {
  const taskTypes = new Map<string, Tier>();
  const models = new Map<Tier, string>();
  for (const [key, value] of parseTableRows(body)) {
    if ((TIERS as readonly string[]).includes(key)) {
      models.set(key as Tier, value);
    } else if ((TIERS as readonly string[]).includes(value.toLowerCase())) {
      taskTypes.set(key, value.toLowerCase() as Tier);
    }
  }
  return { taskTypes, models };
}

function escalate(tier: Tier, steps: number): Tier {
  const idx = Math.min(TIERS.indexOf(tier) + steps, TIERS.length - 1);
  return TIERS[idx]!;
}

export function registerModelSuggest(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "model_suggest",
    {
      title: "Recommend a model tier for a task",
      description:
        "Cost-aware, advisory model recommendation: given a task's type, size and risk, return the cheapest " +
        "adequate tier (eco/standard/frontier) and the matching model, with the rationale. Call it before " +
        "delegating each micro-task. Heuristics live in the '" +
        HEURISTICS_MEMORY +
        "' memory (markdown tables, hand-tunable; seeded with defaults on first use) — it complements " +
        "Copilot's auto model selection, it does not override it.",
      inputSchema: {
        taskType: z
          .string()
          .min(1)
          .describe(
            "Kind of work, e.g. exploration | summarisation | documentation | classification | " +
              "implementation | tests | review | architecture | cross-cutting-refactor | hard-debugging " +
              "(free text; matched against the heuristics table).",
          ),
        size: z
          .enum(["small", "medium", "large"])
          .optional()
          .describe("How much code/context the task touches. 'large' escalates the tier one step."),
        risk: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe("Blast radius of getting it wrong. 'high' escalates the tier one step."),
      },
    },
    async ({ taskType, size, risk }) => {
      let doc = store.get(HEURISTICS_MEMORY);
      let seeded = false;
      if (!doc) {
        const result = await store.write({
          name: HEURISTICS_MEMORY,
          description: "Task-type → model-tier routing table used by model_suggest (hand-tunable)",
          body: DEFAULT_HEURISTICS_BODY,
          type: "reference",
          tags: ["routing", "cost"],
        });
        doc = result.doc;
        seeded = true;
      }

      const heuristics = parseHeuristics(doc.body);
      const wanted = taskType.trim().toLowerCase();
      let matched = wanted;
      let baseTier = heuristics.taskTypes.get(wanted);
      if (!baseTier) {
        // Fuzzy fallback: a table entry containing (or contained in) the input.
        for (const [key, tier] of heuristics.taskTypes) {
          if (key.includes(wanted) || wanted.includes(key)) {
            matched = key;
            baseTier = tier;
            break;
          }
        }
      }
      const unknownType = !baseTier;
      if (!baseTier) {
        matched = "(unknown)";
        baseTier = "standard";
      }

      const steps = (risk === "high" ? 1 : 0) + (size === "large" ? 1 : 0);
      const tier = escalate(baseTier, steps);

      const reasons = [
        unknownType
          ? `task type "${taskType}" is not in the heuristics table — defaulting to standard`
          : `"${matched}" maps to ${baseTier}`,
      ];
      if (risk === "high") reasons.push("escalated one step: high risk");
      if (size === "large") reasons.push("escalated one step: large size");

      return jsonResult({
        tier,
        model: heuristics.models.get(tier) ?? null,
        rationale: reasons.join("; "),
        heuristicsMemory: HEURISTICS_MEMORY,
        seededDefaults: seeded,
      });
    },
  );
}
