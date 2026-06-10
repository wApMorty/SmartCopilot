import type { MemoryDoc } from "../types.js";
import { dedupe, slugify } from "../util.js";

/** Matches `[[target]]`, `[[target|alias]]`, `[[target#heading]]`. */
const WIKILINK = /\[\[([^\]]+)\]\]/g;

/** Extract de-duplicated, slugified wikilink targets from a markdown body. */
export function extractLinks(body: string): string[] {
  const out: string[] = [];
  for (const match of body.matchAll(WIKILINK)) {
    const raw = match[1] ?? "";
    const target = raw.split("|")[0]!.split("#")[0]!.trim();
    if (target) out.push(slugify(target));
  }
  return dedupe(out);
}

export interface GraphView {
  /** Outgoing links that resolve to an existing memory. */
  outgoing: string[];
  /** Outgoing links with no matching memory (dangling references). */
  broken: string[];
  /** Memories that link to this one. */
  backlinks: string[];
}

/** Compute the immediate neighbourhood of `name` within `docs`. */
export function neighbors(name: string, docs: Map<string, MemoryDoc>): GraphView {
  const doc = docs.get(name);
  const outgoing: string[] = [];
  const broken: string[] = [];
  if (doc) {
    for (const target of doc.links) {
      if (docs.has(target)) outgoing.push(target);
      else broken.push(target);
    }
  }
  const backlinks: string[] = [];
  for (const [otherName, other] of docs) {
    if (otherName !== name && other.links.includes(name)) {
      backlinks.push(otherName);
    }
  }
  return {
    outgoing: dedupe(outgoing),
    broken: dedupe(broken),
    backlinks: dedupe(backlinks),
  };
}
