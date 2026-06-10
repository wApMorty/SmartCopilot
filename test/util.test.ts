import { describe, expect, it } from "vitest";
import { dedupe, makeSnippet, normalizeTags, slugify, toIso } from "../src/util.js";

describe("slugify", () => {
  it("kebab-cases and strips accents", () => {
    expect(slugify("Décision sur l'Auth!")).toBe("decision-sur-l-auth");
  });
  it("collapses separators and trims", () => {
    expect(slugify("  Foo   Bar -- baz  ")).toBe("foo-bar-baz");
  });
  it("falls back to 'untitled' for empty input", () => {
    expect(slugify("!!!")).toBe("untitled");
  });
});

describe("normalizeTags", () => {
  it("accepts arrays and comma strings, de-duped", () => {
    expect(normalizeTags(["a", " b ", "a"])).toEqual(["a", "b"]);
    expect(normalizeTags("x, y , x")).toEqual(["x", "y"]);
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe("toIso", () => {
  it("coerces Date and trims strings", () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    expect(toIso(d)).toBe("2026-01-02T03:04:05.000Z");
    expect(toIso("  2026-06-04  ")).toBe("2026-06-04");
    expect(toIso(42)).toBeUndefined();
  });
});

describe("makeSnippet", () => {
  it("centres on the first matching term", () => {
    const body = "Intro text. The retry policy uses exponential backoff for resilience.";
    const snip = makeSnippet(body, "backoff", 10);
    expect(snip).toContain("backoff");
    expect(snip.startsWith("…")).toBe(true);
  });
  it("returns leading text when no term matches", () => {
    expect(makeSnippet("short body", "zzz")).toBe("short body");
  });
});

describe("dedupe", () => {
  it("preserves first-seen order", () => {
    expect(dedupe([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });
});
