import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { PLAN_STATUSES, TASK_STATUSES, WORK_STATUSES, type WorkStatus } from "../types.js";
import { nowIso } from "../util.js";
import { errorResult, jsonResult } from "./helpers.js";
import { planProgress, tasksOfPlan } from "./task_helpers.js";

/** Append `note` to the task's `## Log` section, creating it if needed. */
function appendLog(body: string, note: string): string {
  const entry = `- ${nowIso()} — ${note.trim()}`;
  if (/^## Log$/m.test(body)) return `${body.trimEnd()}\n${entry}`;
  return `${body.trimEnd()}\n\n## Log\n\n${entry}`;
}

export function registerTaskUpdate(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "task_update",
    {
      title: "Advance a task (or close a plan)",
      description:
        "Move a task through its lifecycle: 'in-progress' when delegating it, 'done' once build/tests pass " +
        "and the diff review matches the spec, 'blocked' when it cannot proceed. Record which agent/model " +
        "executed it and a note of what happened (validation results, retries). Also closes a plan " +
        "(status 'closed') — only after the user validated the whole development. The response includes the " +
        "plan's progress and the next pending task.",
      inputSchema: {
        name: z.string().min(1).describe("Slug of the task — or of the plan when closing it."),
        status: z
          .enum([...WORK_STATUSES] as [WorkStatus, ...WorkStatus[]])
          .optional()
          .describe("Tasks: pending | in-progress | done | blocked. Plans: active | closed."),
        note: z
          .string()
          .optional()
          .describe("What happened (validation results, blockers). Appended to the memory's ## Log."),
        agent: z.string().optional().describe("Copilot custom agent that executed the task."),
        model: z.string().optional().describe("Model that executed the task."),
      },
    },
    async ({ name, status, note, agent, model }) => {
      const doc = store.get(name);
      if (!doc) return errorResult(`No memory named "${name}".`);
      const type = doc.frontmatter.type;
      if (type !== "task" && type !== "plan") {
        return errorResult(`"${doc.name}" is a ${type} memory — task_update only handles task and plan.`);
      }
      const allowed: readonly string[] = type === "task" ? TASK_STATUSES : PLAN_STATUSES;
      if (status && !allowed.includes(status)) {
        return errorResult(`Status "${status}" is not valid for a ${type} (allowed: ${allowed.join(", ")}).`);
      }

      const body = note ? appendLog(doc.body, note) : doc.body;
      const result = await store.write({
        name: doc.name,
        description: doc.frontmatter.description,
        body,
        type,
        status,
        agent,
        model,
      });

      const planSlug = type === "plan" ? doc.name : result.doc.frontmatter.plan;
      const progress = planSlug ? planProgress(tasksOfPlan(store, planSlug)) : null;

      const warnings: string[] = [];
      if (type === "plan" && status === "closed" && progress && progress.done < progress.total) {
        warnings.push(
          `Plan closed with ${progress.total - progress.done} of ${progress.total} tasks not done.`,
        );
      }

      return jsonResult({
        name: result.doc.name,
        frontmatter: result.doc.frontmatter,
        plan: planSlug ?? null,
        progress,
        warnings,
      });
    },
  );
}
