import { describe, expect, it } from "vitest";
import { parseMemory, serializeMemory } from "../src/memory/frontmatter.js";
import type { MemoryFrontmatter } from "../src/types.js";

describe("frontmatter parse/serialize", () => {
  it("round-trips a memory", () => {
    const fm: MemoryFrontmatter = {
      name: "retry-policy",
      description: "How retries work",
      type: "decision",
      tags: ["http", "resilience"],
      created: "2026-06-01T00:00:00.000Z",
      updated: "2026-06-02T00:00:00.000Z",
      source: "auto",
    };
    const body = "Use exponential backoff. See [[http-client]].";
    const text = serializeMemory(fm, body);
    const parsed = parseMemory(text, { path: "/x/retry-policy.md", fallbackName: "retry-policy" });

    expect(parsed.frontmatter).toEqual(fm);
    expect(parsed.body).toBe(body);
    expect(parsed.links).toEqual(["http-client"]);
  });

  it("tolerates missing frontmatter with sensible defaults", () => {
    const parsed = parseMemory("Just a body, no frontmatter.", {
      path: "/x/loose-note.md",
      fallbackName: "loose-note",
    });
    expect(parsed.name).toBe("loose-note");
    expect(parsed.frontmatter.type).toBe("reference");
    expect(parsed.frontmatter.source).toBe("manual");
    expect(parsed.frontmatter.tags).toEqual([]);
    expect(parsed.frontmatter.created).toBe(parsed.frontmatter.updated);
  });

  it("round-trips workflow fields on a task", () => {
    const fm: MemoryFrontmatter = {
      name: "add-login-form",
      description: "Add the login form",
      type: "task",
      tags: [],
      created: "2026-06-10T00:00:00.000Z",
      updated: "2026-06-10T00:00:00.000Z",
      source: "auto",
      status: "in-progress",
      plan: "auth-feature",
      order: 2,
      agent: "implementer",
      model: "Claude Sonnet 4.6",
    };
    const parsed = parseMemory(serializeMemory(fm, "Spec. Plan: [[auth-feature]]."), {
      path: "/x/add-login-form.md",
      fallbackName: "add-login-form",
    });
    expect(parsed.frontmatter).toEqual(fm);
    expect(parsed.links).toEqual(["auth-feature"]);
  });

  it("defaults task/plan status and drops workflow fields on other types", () => {
    const task = parseMemory("---\ntype: task\n---\nbody", {
      path: "/x/t.md",
      fallbackName: "t",
    });
    expect(task.frontmatter.status).toBe("pending");

    const plan = parseMemory("---\ntype: plan\n---\nbody", {
      path: "/x/p.md",
      fallbackName: "p",
    });
    expect(plan.frontmatter.status).toBe("active");

    const note = parseMemory("---\ntype: gotcha\nstatus: done\norder: 3\n---\nbody", {
      path: "/x/g.md",
      fallbackName: "g",
    });
    expect(note.frontmatter.status).toBeUndefined();
    expect(note.frontmatter.order).toBeUndefined();
  });

  it("coerces a YAML date and a comma-separated tags string", () => {
    const text = [
      "---",
      "name: Some Note",
      "description: x",
      "type: gotcha",
      "tags: a, b",
      "created: 2026-05-05",
      "---",
      "body",
    ].join("\n");
    const parsed = parseMemory(text, { path: "/x/some-note.md", fallbackName: "some-note" });
    expect(parsed.name).toBe("some-note");
    expect(parsed.frontmatter.type).toBe("gotcha");
    expect(parsed.frontmatter.tags).toEqual(["a", "b"]);
    expect(parsed.frontmatter.created).toContain("2026-05-05");
  });
});
