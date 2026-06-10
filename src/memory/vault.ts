import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Config } from "../config.js";
import type { MemoryDoc, MemoryType, SearchHit, WorkStatus } from "../types.js";
import { dedupe, nowIso, slugify } from "../util.js";
import { parseMemory, serializeMemory } from "./frontmatter.js";
import { neighbors, type GraphView } from "./graph.js";
import { renderIndex } from "./indexFile.js";
import { SearchIndex } from "./search.js";

export interface WriteInput {
  /** If omitted, derived from `description`. */
  name?: string;
  description: string;
  body: string;
  type?: MemoryType;
  tags?: string[];
  source?: "auto" | "manual";
  /** Workflow fields — only persisted on `plan`/`task` memories. */
  status?: WorkStatus;
  plan?: string;
  order?: number;
  agent?: string;
  model?: string;
}

export interface WriteResult {
  doc: MemoryDoc;
  created: boolean;
  /** When creating, near-duplicate memories worth reviewing first. */
  similar: SearchHit[];
}

export interface ListFilter {
  type?: MemoryType;
  tag?: string;
  /** Match the workflow `status` of plan/task memories. */
  status?: WorkStatus;
  /** Match tasks belonging to this plan slug. */
  plan?: string;
  limit?: number;
}

export interface GraphResult {
  name: string;
  exists: boolean;
  description?: string;
  outgoing: Array<{ name: string; description: string }>;
  backlinks: Array<{ name: string; description: string }>;
  broken: string[];
  /** Present when depth >= 2: adjacency of each immediate neighbour. */
  expanded?: Record<string, { outgoing: string[]; backlinks: string[] }>;
}

/**
 * In-memory authority over the markdown vault. Owns the doc map, the search
 * index and the link graph; the on-disk `.md` files remain the source of truth
 * and are re-read on {@link reload}.
 */
export class MemoryStore {
  private docs = new Map<string, MemoryDoc>();
  private readonly index = new SearchIndex();
  /** Serialises mutating operations (reload/write/delete) so they never interleave. */
  private lock: Promise<void> = Promise.resolve();

  constructor(private readonly config: Config) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Load the vault from disk and build the index. Safe to call repeatedly. */
  reload(): Promise<void> {
    return this.serialize(async () => {
      await this.reloadUnlocked();
    });
  }

  private async reloadUnlocked(): Promise<void> {
    await fs.mkdir(this.config.vaultDir, { recursive: true });
    const entries = await fs.readdir(this.config.vaultDir, { withFileTypes: true });
    const docs = new Map<string, MemoryDoc>();

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (entry.name === "INDEX.md") continue;
      const full = path.join(this.config.vaultDir, entry.name);
      const raw = await fs.readFile(full, "utf8");
      const fallbackName = slugify(entry.name.replace(/\.md$/, ""));
      const doc = parseMemory(raw, { path: full, fallbackName });
      if (docs.has(doc.name)) {
        process.stderr.write(
          `[smartcopilot] duplicate memory name "${doc.name}" — ${full} overrides earlier file\n`,
        );
      }
      docs.set(doc.name, doc);
    }

    this.docs = docs;
    this.index.rebuild(this.docs.values());
  }

  get(name: string): MemoryDoc | undefined {
    return this.docs.get(slugify(name));
  }

  /** Resolve by memory name or by absolute/relative file path. */
  resolve(nameOrPath: string): MemoryDoc | undefined {
    const bySlug = this.docs.get(slugify(nameOrPath));
    if (bySlug) return bySlug;
    const abs = path.resolve(this.config.vaultDir, nameOrPath);
    for (const doc of this.docs.values()) {
      if (doc.path === abs || doc.path === nameOrPath) return doc;
    }
    return undefined;
  }

  list(filter: ListFilter = {}): MemoryDoc[] {
    const tag = filter.tag?.toLowerCase();
    let docs = [...this.docs.values()];
    if (filter.type) docs = docs.filter((d) => d.frontmatter.type === filter.type);
    if (tag) docs = docs.filter((d) => d.frontmatter.tags.some((t) => t.toLowerCase() === tag));
    if (filter.status) docs = docs.filter((d) => d.frontmatter.status === filter.status);
    if (filter.plan) {
      const plan = slugify(filter.plan);
      docs = docs.filter((d) => d.frontmatter.plan === plan);
    }
    docs.sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated));
    return filter.limit ? docs.slice(0, filter.limit) : docs;
  }

  search(
    query: string,
    opts: { type?: MemoryType; tags?: string[]; limit?: number } = {},
  ): SearchHit[] {
    return this.index.search(query, this.docs, opts);
  }

  graph(name: string, depth = 1): GraphResult {
    const slug = slugify(name);
    const focus = this.docs.get(slug);
    const view = neighbors(slug, this.docs);
    const describe = (n: string) => ({
      name: n,
      description: this.docs.get(n)?.frontmatter.description ?? "",
    });

    const result: GraphResult = {
      name: slug,
      exists: Boolean(focus),
      description: focus?.frontmatter.description,
      outgoing: view.outgoing.map(describe),
      backlinks: view.backlinks.map(describe),
      broken: view.broken,
    };

    if (depth >= 2) {
      const expanded: GraphResult["expanded"] = {};
      for (const n of dedupe([...view.outgoing, ...view.backlinks])) {
        const v: GraphView = neighbors(n, this.docs);
        expanded[n] = { outgoing: v.outgoing, backlinks: v.backlinks };
      }
      result.expanded = expanded;
    }
    return result;
  }

  write(input: WriteInput): Promise<WriteResult> {
    return this.serialize(() => this.writeUnlocked(input));
  }

  private async writeUnlocked(input: WriteInput): Promise<WriteResult> {
    const name = slugify(input.name?.trim() || input.description);
    const existing = this.docs.get(name);
    const now = nowIso();
    const type = input.type ?? existing?.frontmatter.type ?? "reference";

    const doc: MemoryDoc = {
      name,
      path: existing?.path ?? path.join(this.config.vaultDir, `${name}.md`),
      frontmatter: {
        name,
        description: input.description.trim(),
        type,
        tags: dedupe((input.tags ?? existing?.frontmatter.tags ?? []).map((t) => t.trim()).filter(Boolean)),
        created: existing?.frontmatter.created ?? now,
        updated: now,
        source: input.source ?? (existing ? existing.frontmatter.source : "auto"),
      },
      body: input.body.trim(),
      links: [],
    };

    // Workflow fields: updates preserve what they don't override; the type
    // gates which fields are persisted at all.
    if (type === "task" || type === "plan") {
      doc.frontmatter.status =
        input.status ??
        existing?.frontmatter.status ??
        (type === "task" ? "pending" : "active");
    }
    if (type === "task") {
      const plan = input.plan ?? existing?.frontmatter.plan;
      if (plan) doc.frontmatter.plan = slugify(plan);
      const order = input.order ?? existing?.frontmatter.order;
      if (order !== undefined) doc.frontmatter.order = order;
      const agent = input.agent ?? existing?.frontmatter.agent;
      if (agent) doc.frontmatter.agent = agent;
      const model = input.model ?? existing?.frontmatter.model;
      if (model) doc.frontmatter.model = model;
    }
    doc.links = parseMemory(serializeMemory(doc.frontmatter, doc.body), {
      path: doc.path,
      fallbackName: name,
    }).links;

    // Surface near-duplicates before they accumulate (informational only).
    const similar = existing
      ? []
      : this.search(`${name.replace(/-/g, " ")} ${input.description}`, { limit: 3 }).filter(
          (h) => h.name !== name,
        );

    await writeFileAtomic(doc.path, serializeMemory(doc.frontmatter, doc.body));
    this.docs.set(name, doc);
    this.index.rebuild(this.docs.values());
    await this.regenerateIndexFile();

    return { doc, created: !existing, similar };
  }

  delete(name: string): Promise<{ deleted: boolean; nowBroken: string[] }> {
    return this.serialize(() => this.deleteUnlocked(name));
  }

  private async deleteUnlocked(name: string): Promise<{ deleted: boolean; nowBroken: string[] }> {
    const slug = slugify(name);
    const doc = this.docs.get(slug);
    if (!doc) return { deleted: false, nowBroken: [] };

    await fs.rm(doc.path, { force: true });
    this.docs.delete(slug);
    this.index.rebuild(this.docs.values());
    await this.regenerateIndexFile();

    // Backlinks that now dangle, so the caller can fix references.
    const nowBroken: string[] = [];
    for (const [otherName, other] of this.docs) {
      if (other.links.includes(slug)) nowBroken.push(otherName);
    }
    return { deleted: true, nowBroken };
  }

  async regenerateIndexFile(): Promise<void> {
    const content = renderIndex([...this.docs.values()]);
    await writeFileAtomic(this.config.indexFile, content);
  }

  /** Number of memories currently loaded. */
  get size(): number {
    return this.docs.size;
  }
}

/** Write via a temp file + rename so readers never observe a partial file. */
async function writeFileAtomic(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.writeFile(tmp, content, "utf8");
  try {
    await fs.rename(tmp, target);
  } catch (err) {
    // Cross-device rename fallback (rare; e.g. tmp on another mount).
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await fs.copyFile(tmp, target);
      await fs.rm(tmp, { force: true });
    } else {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }
}

/** Convenience for tests: a unique temp vault directory. */
export async function makeTempVaultDir(prefix = "smartcopilot-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
