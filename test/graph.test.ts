import { describe, expect, it } from "vitest";
import { extractLinks, neighbors } from "../src/memory/graph.js";
import type { MemoryDoc } from "../src/types.js";

function doc(name: string, links: string[]): MemoryDoc {
  return {
    name,
    path: `/x/${name}.md`,
    frontmatter: {
      name,
      description: name,
      type: "reference",
      tags: [],
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      source: "auto",
    },
    body: "",
    links,
  };
}

describe("extractLinks", () => {
  it("handles plain, aliased and heading links, slugified and de-duped", () => {
    const body = "See [[Auth Flow]], [[auth-flow|the flow]] and [[Cache#ttl]].";
    expect(extractLinks(body)).toEqual(["auth-flow", "cache"]);
  });
});

describe("neighbors", () => {
  it("splits resolved vs broken outgoing links and finds backlinks", () => {
    const docs = new Map<string, MemoryDoc>([
      ["a", doc("a", ["b", "ghost"])],
      ["b", doc("b", [])],
      ["c", doc("c", ["a"])],
    ]);
    const view = neighbors("a", docs);
    expect(view.outgoing).toEqual(["b"]);
    expect(view.broken).toEqual(["ghost"]);
    expect(view.backlinks).toEqual(["c"]);
  });
});
