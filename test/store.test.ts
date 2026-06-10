import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { MemoryStore, makeTempVaultDir } from "../src/memory/vault.js";

let vaultDir: string;
let config: Config;
let store: MemoryStore;

beforeEach(async () => {
  vaultDir = await makeTempVaultDir();
  config = { vaultDir, indexFile: path.join(vaultDir, "INDEX.md") };
  store = new MemoryStore(config);
  await store.reload();
});

afterEach(async () => {
  await fs.rm(vaultDir, { recursive: true, force: true });
});

describe("write & read", () => {
  it("creates a memory file with a derived name and reads it back", async () => {
    const res = await store.write({
      description: "Use exponential backoff for HTTP retries",
      body: "Cap at 5 attempts. Related: [[http-client]].",
      type: "decision",
      tags: ["http", "Resilience"],
    });

    expect(res.created).toBe(true);
    expect(res.doc.name).toBe("use-exponential-backoff-for-http-retries");
    expect(res.doc.frontmatter.tags).toEqual(["http", "Resilience"]);
    expect(res.doc.links).toEqual(["http-client"]);

    const onDisk = await fs.readFile(res.doc.path, "utf8");
    expect(onDisk).toContain("type: decision");

    const read = store.resolve(res.doc.name);
    expect(read?.frontmatter.description).toContain("backoff");
  });

  it("updates in place, preserving created and bumping updated", async () => {
    const first = await store.write({ name: "topic", description: "v1", body: "one" });
    const createdAt = first.doc.frontmatter.created;
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.write({ name: "topic", description: "v2", body: "two" });

    expect(second.created).toBe(false);
    expect(second.doc.frontmatter.created).toBe(createdAt);
    expect(second.doc.frontmatter.updated >= createdAt).toBe(true);
    expect(store.size).toBe(1);
  });

  it("flags near-duplicates when creating", async () => {
    await store.write({ description: "Database connection pooling settings", body: "pool size 10" });
    const dup = await store.write({
      description: "Connection pooling for the database",
      body: "pool size 20",
    });
    expect(dup.similar.map((s) => s.name)).toContain(
      "database-connection-pooling-settings",
    );
  });
});

describe("search & list", () => {
  beforeEach(async () => {
    await store.write({ description: "Auth uses JWT", body: "tokens signed with RS256", type: "decision", tags: ["auth"] });
    await store.write({ description: "Cache TTL is 60s", body: "redis cache", type: "pattern", tags: ["cache"] });
    await store.write({ description: "Logging gotcha", body: "do not log secrets", type: "gotcha", tags: ["auth"] });
  });

  it("ranks full-text matches", () => {
    const hits = store.search("jwt tokens");
    expect(hits[0]?.name).toBe("auth-uses-jwt");
    expect(hits[0]?.snippet).toContain("RS256");
  });

  it("filters by type and by tags", () => {
    expect(store.search("auth", { type: "gotcha" }).map((h) => h.name)).toEqual(["logging-gotcha"]);
    const tagged = store.search("auth", { tags: ["auth"] }).map((h) => h.name);
    expect(tagged).toContain("auth-uses-jwt");
    expect(tagged).not.toContain("cache-ttl-is-60s");
  });

  it("lists most-recently-updated first and filters", () => {
    const all = store.list();
    expect(all[0]?.name).toBe("logging-gotcha");
    expect(store.list({ type: "pattern" }).map((d) => d.name)).toEqual(["cache-ttl-is-60s"]);
    expect(store.list({ tag: "auth" })).toHaveLength(2);
  });
});

describe("graph", () => {
  it("resolves outgoing, backlinks and broken at depth 1 and expands at depth 2", async () => {
    await store.write({ name: "a", description: "A", body: "links [[b]] and [[ghost]]" });
    await store.write({ name: "b", description: "B", body: "links [[c]]" });
    await store.write({ name: "c", description: "C", body: "back to [[a]]" });

    const g = store.graph("a", 2);
    expect(g.exists).toBe(true);
    expect(g.outgoing.map((o) => o.name)).toEqual(["b"]);
    expect(g.broken).toEqual(["ghost"]);
    expect(g.backlinks.map((b) => b.name)).toEqual(["c"]);
    expect(g.expanded?.b?.outgoing).toEqual(["c"]);
  });
});

describe("delete", () => {
  it("removes the file and reports newly broken backlinks", async () => {
    await store.write({ name: "target", description: "T", body: "x" });
    await store.write({ name: "referrer", description: "R", body: "see [[target]]" });

    const res = await store.delete("target");
    expect(res.deleted).toBe(true);
    expect(res.nowBroken).toEqual(["referrer"]);
    expect(store.resolve("target")).toBeUndefined();
    await expect(fs.readFile(path.join(vaultDir, "target.md"))).rejects.toThrow();
  });

  it("reports when nothing was deleted", async () => {
    expect((await store.delete("missing")).deleted).toBe(false);
  });
});

describe("INDEX.md generation", () => {
  it("regenerates a grouped index on write", async () => {
    await store.write({ name: "alpha", description: "First", body: "x", type: "decision" });
    await store.write({ name: "beta", description: "Second", body: "y", type: "pattern" });
    const index = await fs.readFile(config.indexFile, "utf8");
    expect(index).toContain("## decision");
    expect(index).toContain("[[alpha]] — First");
    expect(index).toContain("## pattern");
  });
});

describe("manual edits (reload)", () => {
  it("picks up a hand-written file and its links on reload", async () => {
    const file = path.join(vaultDir, "hand-written.md");
    await fs.writeFile(
      file,
      ["---", "description: written by a human", "type: reference", "---", "see [[somewhere]]"].join("\n"),
      "utf8",
    );
    await store.reload();
    const doc = store.resolve("hand-written");
    expect(doc?.frontmatter.source).toBe("manual");
    expect(doc?.links).toEqual(["somewhere"]);
    expect(store.search("human").map((h) => h.name)).toContain("hand-written");
  });
});
