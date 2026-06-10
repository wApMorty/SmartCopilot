import { promises as fs } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { MemoryStore, makeTempVaultDir } from "../src/memory/vault.js";
import { createServer } from "../src/server.js";

/**
 * End-to-end through the real MCP machinery: a Client talks to our server over
 * a linked in-memory transport, exercising sequential request/response exactly
 * as Copilot does (one tools/call awaited before the next).
 */

let vaultDir: string;
let client: Client;

function text(result: unknown): any {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  return JSON.parse(content[0]!.text);
}

beforeEach(async () => {
  vaultDir = await makeTempVaultDir();
  const config: Config = { vaultDir, indexFile: path.join(vaultDir, "INDEX.md") };
  const store = new MemoryStore(config);
  await store.reload();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(store);
  await server.connect(serverTransport);

  client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await fs.rm(vaultDir, { recursive: true, force: true });
});

describe("MCP server (in-process client)", () => {
  it("advertises the memory and task tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "memory_delete",
        "memory_graph",
        "memory_list",
        "memory_read",
        "memory_search",
        "memory_write",
        "model_suggest",
        "task_list",
        "task_plan",
        "task_update",
      ],
    );
  });

  it("suggests a model tier, seeding then honouring the heuristics memory", async () => {
    const first = text(
      await client.callTool({ name: "model_suggest", arguments: { taskType: "exploration" } }),
    );
    expect(first.seededDefaults).toBe(true);
    expect(first.tier).toBe("eco");
    expect(first.model).toBe("Claude Haiku 4.5");

    // High risk escalates one step from the table's tier.
    const risky = text(
      await client.callTool({
        name: "model_suggest",
        arguments: { taskType: "implementation", risk: "high" },
      }),
    );
    expect(risky.seededDefaults).toBe(false);
    expect(risky.tier).toBe("frontier");

    // Unknown types fall back to standard and say so.
    const unknown = text(
      await client.callTool({ name: "model_suggest", arguments: { taskType: "interpretive-dance" } }),
    );
    expect(unknown.tier).toBe("standard");
    expect(unknown.rationale).toContain("not in the heuristics table");

    // A hand-tuned table wins: route exploration to standard, remap the model.
    await client.callTool({
      name: "memory_write",
      arguments: {
        name: "model-routing-heuristics",
        description: "Tuned routing table",
        body: "| exploration | standard |\n\n| standard | My Custom Model |",
      },
    });
    const tuned = text(
      await client.callTool({ name: "model_suggest", arguments: { taskType: "exploration" } }),
    );
    expect(tuned.tier).toBe("standard");
    expect(tuned.model).toBe("My Custom Model");
  });

  it("write → search → read → graph → delete, sequentially", async () => {
    const written = text(
      await client.callTool({
        name: "memory_write",
        arguments: {
          description: "HTTP retries use exponential backoff",
          body: "Cap at 5 attempts. Related: [[http-client]].",
          type: "decision",
          tags: ["http"],
        },
      }),
    );
    expect(written.created).toBe(true);
    expect(written.name).toBe("http-retries-use-exponential-backoff");

    const found = text(
      await client.callTool({ name: "memory_search", arguments: { query: "backoff retries" } }),
    );
    expect(found.count).toBe(1);
    expect(found.hits[0].name).toBe("http-retries-use-exponential-backoff");

    const read = text(
      await client.callTool({
        name: "memory_read",
        arguments: { target: "http-retries-use-exponential-backoff" },
      }),
    );
    expect(read.frontmatter.type).toBe("decision");
    expect(read.broken).toEqual(["http-client"]);

    const graph = text(
      await client.callTool({
        name: "memory_graph",
        arguments: { name: "http-retries-use-exponential-backoff" },
      }),
    );
    expect(graph.exists).toBe(true);
    expect(graph.broken).toEqual(["http-client"]);

    const deleted = text(
      await client.callTool({
        name: "memory_delete",
        arguments: { name: "http-retries-use-exponential-backoff" },
      }),
    );
    expect(deleted.deleted).toBe(true);
  });

  it("runs a plan through its lifecycle: plan → list → update → close", async () => {
    const planned = text(
      await client.callTool({
        name: "task_plan",
        arguments: {
          goal: "Add user authentication",
          name: "auth-feature",
          context: "Constrained by [[http-retries]].",
          tasks: [
            { title: "Create the user model", spec: "Define the schema.", acceptance: "Tests green." },
            { title: "Add the login form", spec: "Build the form. See [[auth-feature]]." },
          ],
        },
      }),
    );
    expect(planned.plan.name).toBe("auth-feature");
    expect(planned.tasks.map((t: any) => t.name)).toEqual([
      "create-the-user-model",
      "add-the-login-form",
    ]);
    expect(planned.otherActivePlans).toEqual([]);

    // No plan argument: resolves the single active plan.
    const listed = text(await client.callTool({ name: "task_list", arguments: {} }));
    expect(listed.plan.name).toBe("auth-feature");
    expect(listed.progress).toMatchObject({ total: 2, pending: 2, done: 0 });
    expect(listed.progress.next.name).toBe("create-the-user-model");

    const done = text(
      await client.callTool({
        name: "task_update",
        arguments: {
          name: "create-the-user-model",
          status: "done",
          note: "Build, tests and diff review green.",
          agent: "implementer",
          model: "Claude Sonnet 4.6",
        },
      }),
    );
    expect(done.frontmatter.status).toBe("done");
    expect(done.frontmatter.agent).toBe("implementer");
    expect(done.progress).toMatchObject({ total: 2, done: 1, pending: 1 });
    expect(done.progress.next.name).toBe("add-the-login-form");

    // A plan only accepts plan statuses.
    const invalid = await client.callTool({
      name: "task_update",
      arguments: { name: "auth-feature", status: "done" },
    });
    expect((invalid as { isError?: boolean }).isError).toBe(true);

    // Closing with an unfinished task warns but proceeds.
    const closed = text(
      await client.callTool({
        name: "task_update",
        arguments: { name: "auth-feature", status: "closed" },
      }),
    );
    expect(closed.frontmatter.status).toBe("closed");
    expect(closed.warnings).toHaveLength(1);

    const noActive = text(await client.callTool({ name: "task_list", arguments: {} }));
    expect(noActive.plan).toBeNull();
    expect(noActive.plans).toHaveLength(1);
  });

  it("rejects a plan whose slug collides with an existing memory", async () => {
    await client.callTool({
      name: "memory_write",
      arguments: { description: "Auth feature", body: "x", name: "auth-feature" },
    });
    const result = await client.callTool({
      name: "task_plan",
      arguments: { goal: "Auth", name: "auth-feature", tasks: [{ title: "t", spec: "s" }] },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
  });

  it("reports a tool error for a missing memory", async () => {
    const result = await client.callTool({
      name: "memory_read",
      arguments: { target: "does-not-exist" },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
  });
});
