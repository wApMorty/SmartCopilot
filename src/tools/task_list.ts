import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { slugify } from "../util.js";
import { errorResult, jsonResult } from "./helpers.js";
import { planProgress, summarizeTask, taskStatusSchema, tasksOfPlan } from "./task_helpers.js";

export function registerTaskList(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "task_list",
    {
      title: "List the tasks of a plan",
      description:
        "Show a plan's tasks in execution order with their status, plus progress counts and the next pending " +
        "task. Call it when resuming work (to pick up where a previous session left off) and between tasks to " +
        "decide what to delegate next. Defaults to the single active plan; lists all plans when none is active " +
        "or several are.",
      inputSchema: {
        plan: z
          .string()
          .optional()
          .describe("Plan slug. Omit to use the single active plan."),
        status: taskStatusSchema
          .optional()
          .describe("Only return tasks with this status."),
      },
    },
    async ({ plan, status }) => {
      let planDoc;
      if (plan) {
        planDoc = store.get(plan);
        if (!planDoc || planDoc.frontmatter.type !== "plan") {
          return errorResult(`No plan named "${slugify(plan)}".`);
        }
      } else {
        const active = store.list({ type: "plan", status: "active" });
        if (active.length !== 1) {
          return jsonResult({
            plan: null,
            reason:
              active.length === 0
                ? "No active plan. Create one with task_plan, or pass a plan slug."
                : "Several active plans — pass the plan slug.",
            plans: store.list({ type: "plan" }).map((d) => ({
              name: d.name,
              description: d.frontmatter.description,
              status: d.frontmatter.status,
            })),
          });
        }
        planDoc = active[0]!;
      }

      const tasks = tasksOfPlan(store, planDoc.name);
      const progress = planProgress(tasks);
      const shown = status
        ? tasks.filter((t) => (t.frontmatter.status ?? "pending") === status)
        : tasks;

      return jsonResult({
        plan: {
          name: planDoc.name,
          description: planDoc.frontmatter.description,
          status: planDoc.frontmatter.status,
        },
        progress,
        tasks: shown.map(summarizeTask),
      });
    },
  );
}
