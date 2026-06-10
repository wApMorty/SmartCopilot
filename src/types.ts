/**
 * Core domain types for the SmartCopilot memory.
 *
 * The memory is a graph of markdown files: one fact per file, identified by a
 * stable kebab-case `name` (the wikilink target), connected via `[[links]]`.
 */

export const MEMORY_TYPES = [
  "decision",
  "pattern",
  "gotcha",
  "reference",
  "preference",
  "todo",
  "plan",
  "task",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Lifecycle of a `type: task` memory. */
export const TASK_STATUSES = ["pending", "in-progress", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Lifecycle of a `type: plan` memory. Closed only after user validation. */
export const PLAN_STATUSES = ["active", "closed"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export type WorkStatus = TaskStatus | PlanStatus;

export const WORK_STATUSES = [...TASK_STATUSES, ...PLAN_STATUSES] as const;

export interface MemoryFrontmatter {
  /** Stable kebab-case slug. Also the filename stem and the wikilink target. */
  name: string;
  /** One-line summary, used for ranking and previews. */
  description: string;
  type: MemoryType;
  tags: string[];
  /** ISO 8601 timestamps. */
  created: string;
  updated: string;
  /** Whether the agent (`auto`) or a human (`manual`) authored it. */
  source: "auto" | "manual";
  /** Lifecycle state — `plan` and `task` memories only. */
  status?: WorkStatus;
  /** `task` only: slug of the parent `type: plan` memory. */
  plan?: string;
  /** `task` only: 1-based position within the plan. */
  order?: number;
  /** `task` only: Copilot custom agent that executed it (recorded on update). */
  agent?: string;
  /** `task` only: model that executed it (recorded on update). */
  model?: string;
}

export interface MemoryDoc {
  name: string;
  /** Absolute path to the `.md` file. */
  path: string;
  frontmatter: MemoryFrontmatter;
  /** Markdown body without the frontmatter block. */
  body: string;
  /** De-duplicated wikilink targets (slugs) found in the body. */
  links: string[];
}

export interface SearchHit {
  name: string;
  description: string;
  type: MemoryType;
  tags: string[];
  path: string;
  score: number;
  snippet: string;
}
