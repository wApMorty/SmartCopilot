import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import { slugify } from "../util.js";
import { errorResult, jsonResult } from "./helpers.js";
import { summarizeTask } from "./task_helpers.js";

export function registerTaskPlan(server: McpServer, store: MemoryStore): void {
  server.registerTool(
    "task_plan",
    {
      title: "Persist a development plan as micro-tasks",
      description:
        "Decompose a development request into an ordered list of micro-tasks and persist them in memory " +
        "(one `plan` memory linking N `task` memories). Call it AFTER recalling related memories with " +
        "memory_search and BEFORE writing any code, so the plan survives across sessions. Each task needs a " +
        "self-contained spec and acceptance criteria — a specialised agent will execute it without further " +
        "context. The response flags other active plans (normally there should be at most one).",
      inputSchema: {
        goal: z
          .string()
          .min(1)
          .describe("One-line goal of the development. Becomes the plan's description."),
        name: z
          .string()
          .optional()
          .describe("Stable kebab-case slug for the plan. Omit to derive it from the goal."),
        context: z
          .string()
          .optional()
          .describe(
            "Markdown context for the whole plan: constraints, relevant decisions (link them with " +
              "[[other-slug]]), affected areas.",
          ),
        tasks: z
          .array(
            z.object({
              title: z.string().min(1).describe("Short imperative title. Becomes the task's description."),
              spec: z
                .string()
                .min(1)
                .describe(
                  "What to do, in markdown, self-contained enough for a specialised agent. Link related " +
                    "memories with [[other-slug]].",
                ),
              acceptance: z
                .string()
                .optional()
                .describe("Acceptance criteria the reviewer validates the diff against."),
            }),
          )
          .min(1)
          .describe("Ordered micro-tasks; execution follows this order."),
      },
    },
    async ({ goal, name, context, tasks }) => {
      const planSlug = slugify(name?.trim() || goal);
      if (store.get(planSlug)) {
        return errorResult(
          `A memory named "${planSlug}" already exists. Pick another plan name, or update tasks with task_update.`,
        );
      }

      // Resolve a unique slug per task before writing anything.
      const taken = new Set<string>([planSlug]);
      const slugs: string[] = [];
      for (const task of tasks) {
        let slug = slugify(task.title);
        if (taken.has(slug) || store.get(slug)) slug = `${planSlug}-${slug}`;
        if (taken.has(slug) || store.get(slug)) {
          return errorResult(
            `Cannot derive a unique slug for task "${task.title}" ("${slug}" is taken). Use more specific titles.`,
          );
        }
        taken.add(slug);
        slugs.push(slug);
      }

      const otherActivePlans = store
        .list({ type: "plan", status: "active" })
        .map((d) => ({ name: d.name, description: d.frontmatter.description }));

      const written = [];
      for (const [i, task] of tasks.entries()) {
        const body = [
          task.spec.trim(),
          task.acceptance ? `## Acceptance criteria\n\n${task.acceptance.trim()}` : "",
          `Plan: [[${planSlug}]]`,
        ]
          .filter(Boolean)
          .join("\n\n");
        const result = await store.write({
          name: slugs[i],
          description: task.title.trim(),
          body,
          type: "task",
          status: "pending",
          plan: planSlug,
          order: i + 1,
        });
        written.push(summarizeTask(result.doc));
      }

      const planBody = [
        context?.trim() ?? "",
        "## Tasks",
        tasks.map((t, i) => `${i + 1}. [[${slugs[i]}]] — ${t.title.trim()}`).join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n");
      const plan = await store.write({
        name: planSlug,
        description: goal.trim(),
        body: planBody,
        type: "plan",
        status: "active",
      });

      return jsonResult({
        plan: { name: plan.doc.name, description: plan.doc.frontmatter.description, path: plan.doc.path },
        tasks: written,
        otherActivePlans,
      });
    },
  );
}
