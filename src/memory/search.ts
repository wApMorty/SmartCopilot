import MiniSearch from "minisearch";
import type { MemoryDoc, MemoryType, SearchHit } from "../types.js";
import { makeSnippet } from "../util.js";

interface IndexedFields {
  id: string;
  name: string;
  description: string;
  tags: string;
  body: string;
}

function toIndexed(doc: MemoryDoc): IndexedFields {
  return {
    id: doc.name,
    name: doc.name.replace(/-/g, " "),
    description: doc.frontmatter.description,
    tags: doc.frontmatter.tags.join(" "),
    body: doc.body,
  };
}

/**
 * Lexical full-text index over the vault. Kept fully in memory and rebuilt
 * from disk on startup / external edits — small for typical project vaults,
 * and the file format stays open to a future vector index without migration.
 */
export class SearchIndex {
  private mini = SearchIndex.create();

  private static create(): MiniSearch<IndexedFields> {
    return new MiniSearch<IndexedFields>({
      fields: ["name", "description", "tags", "body"],
      storeFields: ["id"],
      searchOptions: {
        boost: { name: 3, description: 2, tags: 2 },
        prefix: true,
        fuzzy: 0.2,
        // OR (the default): rank by relevance rather than requiring every term.
        combineWith: "OR",
      },
    });
  }

  /** Replace the entire index contents. */
  rebuild(docs: Iterable<MemoryDoc>): void {
    this.mini = SearchIndex.create();
    this.mini.addAll([...docs].map(toIndexed));
  }

  /**
   * Search the index and resolve hits against the live `docs` map.
   * Filtering by type/tags is applied after ranking.
   */
  search(
    query: string,
    docs: Map<string, MemoryDoc>,
    opts: { type?: MemoryType; tags?: string[]; limit?: number } = {},
  ): SearchHit[] {
    const limit = opts.limit ?? 10;
    const wantTags = (opts.tags ?? []).map((t) => t.toLowerCase());
    const results = this.mini.search(query);
    const hits: SearchHit[] = [];

    for (const result of results) {
      const doc = docs.get(result.id);
      if (!doc) continue;
      if (opts.type && doc.frontmatter.type !== opts.type) continue;
      if (wantTags.length) {
        const docTags = doc.frontmatter.tags.map((t) => t.toLowerCase());
        if (!wantTags.every((t) => docTags.includes(t))) continue;
      }
      hits.push({
        name: doc.name,
        description: doc.frontmatter.description,
        type: doc.frontmatter.type,
        tags: doc.frontmatter.tags,
        path: doc.path,
        score: Number(result.score.toFixed(4)),
        snippet: makeSnippet(doc.body, query),
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }
}
