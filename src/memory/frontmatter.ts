import matter from "gray-matter";
import {
  MEMORY_TYPES,
  PLAN_STATUSES,
  TASK_STATUSES,
  type MemoryDoc,
  type MemoryFrontmatter,
  type MemoryType,
  type WorkStatus,
} from "../types.js";
import { normalizeTags, nowIso, slugify, toIso } from "../util.js";
import { extractLinks } from "./graph.js";

export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === "string" && (MEMORY_TYPES as readonly string[]).includes(value);
}

/** A status is only meaningful on the matching type; anything else is dropped. */
function parseStatus(value: unknown, type: MemoryType): WorkStatus | undefined {
  if (typeof value !== "string") return undefined;
  if (type === "task" && (TASK_STATUSES as readonly string[]).includes(value)) {
    return value as WorkStatus;
  }
  if (type === "plan" && (PLAN_STATUSES as readonly string[]).includes(value)) {
    return value as WorkStatus;
  }
  return undefined;
}

export interface ParseOptions {
  path: string;
  /** Used as `name` when frontmatter omits one (e.g. a hand-written file). */
  fallbackName: string;
}

/**
 * Parse a raw `.md` file into a normalised {@link MemoryDoc}. Tolerant by
 * design: hand-edited files with missing or malformed frontmatter still load,
 * filling sensible defaults so manual authoring never breaks the vault.
 */
export function parseMemory(raw: string, options: ParseOptions): MemoryDoc {
  const parsed = matter(raw);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const body = parsed.content.trim();

  const name =
    typeof data.name === "string" && data.name.trim()
      ? slugify(data.name)
      : options.fallbackName;

  const created = toIso(data.created) ?? nowIso();
  const type = isMemoryType(data.type) ? data.type : "reference";
  const frontmatter: MemoryFrontmatter = {
    name,
    description: typeof data.description === "string" ? data.description.trim() : "",
    type,
    tags: normalizeTags(data.tags),
    created,
    updated: toIso(data.updated) ?? created,
    source: data.source === "manual" || data.source === "auto" ? data.source : "manual",
  };

  // Workflow fields (plan/task lifecycle). Defaults keep hand-written files valid.
  if (type === "task" || type === "plan") {
    frontmatter.status =
      parseStatus(data.status, type) ?? (type === "task" ? "pending" : "active");
  }
  if (type === "task") {
    if (typeof data.plan === "string" && data.plan.trim()) {
      frontmatter.plan = slugify(data.plan);
    }
    if (typeof data.order === "number" && Number.isFinite(data.order)) {
      frontmatter.order = data.order;
    }
    if (typeof data.agent === "string" && data.agent.trim()) {
      frontmatter.agent = data.agent.trim();
    }
    if (typeof data.model === "string" && data.model.trim()) {
      frontmatter.model = data.model.trim();
    }
  }

  return { name, path: options.path, frontmatter, body, links: extractLinks(body) };
}

/** Serialise frontmatter + body back into canonical `.md` text. */
export function serializeMemory(frontmatter: MemoryFrontmatter, body: string): string {
  // gray-matter preserves key order from the object we pass. Workflow fields
  // are omitted when unset so non-task memories keep their existing shape.
  const data: Record<string, unknown> = {
    name: frontmatter.name,
    description: frontmatter.description,
    type: frontmatter.type,
    tags: frontmatter.tags,
    created: frontmatter.created,
    updated: frontmatter.updated,
    source: frontmatter.source,
  };
  if (frontmatter.status !== undefined) data.status = frontmatter.status;
  if (frontmatter.plan !== undefined) data.plan = frontmatter.plan;
  if (frontmatter.order !== undefined) data.order = frontmatter.order;
  if (frontmatter.agent !== undefined) data.agent = frontmatter.agent;
  if (frontmatter.model !== undefined) data.model = frontmatter.model;
  return matter.stringify(`${body.trim()}\n`, data);
}
