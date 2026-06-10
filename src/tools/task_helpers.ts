import { z } from "zod";
import type { MemoryStore } from "../memory/vault.js";
import {
  PLAN_STATUSES,
  TASK_STATUSES,
  type MemoryDoc,
  type PlanStatus,
  type TaskStatus,
} from "../types.js";

export const taskStatusSchema = z.enum(
  [...TASK_STATUSES] as [TaskStatus, ...TaskStatus[]],
);

export const planStatusSchema = z.enum(
  [...PLAN_STATUSES] as [PlanStatus, ...PlanStatus[]],
);

export interface TaskSummary {
  order?: number;
  name: string;
  description: string;
  status?: string;
  agent?: string;
  model?: string;
}

export function summarizeTask(doc: MemoryDoc): TaskSummary {
  const fm = doc.frontmatter;
  const summary: TaskSummary = {
    name: doc.name,
    description: fm.description,
    status: fm.status,
  };
  if (fm.order !== undefined) summary.order = fm.order;
  if (fm.agent) summary.agent = fm.agent;
  if (fm.model) summary.model = fm.model;
  return summary;
}

/** Tasks of a plan in execution order (then by name for stability). */
export function tasksOfPlan(store: MemoryStore, planSlug: string): MemoryDoc[] {
  return store
    .list({ type: "task", plan: planSlug })
    .sort(
      (a, b) =>
        (a.frontmatter.order ?? Number.MAX_SAFE_INTEGER) -
          (b.frontmatter.order ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    );
}

export interface PlanProgress {
  total: number;
  pending: number;
  "in-progress": number;
  done: number;
  blocked: number;
  /** First pending task in order — what the orchestrator should run next. */
  next: TaskSummary | null;
}

export function planProgress(tasks: MemoryDoc[]): PlanProgress {
  const progress: PlanProgress = {
    total: tasks.length,
    pending: 0,
    "in-progress": 0,
    done: 0,
    blocked: 0,
    next: null,
  };
  for (const task of tasks) {
    const status = (task.frontmatter.status ?? "pending") as TaskStatus;
    progress[status] += 1;
  }
  const next = tasks.find((t) => (t.frontmatter.status ?? "pending") === "pending");
  progress.next = next ? summarizeTask(next) : null;
  return progress;
}
