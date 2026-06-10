/** Small pure helpers shared across the memory layer. */

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "untitled";
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Coerce a YAML-parsed value (which may be a Date) into an ISO string. */
export function toIso(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupe(value.map((t) => String(t).trim()).filter(Boolean));
  }
  if (typeof value === "string") {
    return dedupe(value.split(",").map((t) => t.trim()).filter(Boolean));
  }
  return [];
}

export function dedupe<T>(arr: readonly T[]): T[] {
  return [...new Set(arr)];
}

/** Build a short snippet of `body` around the first matching query term. */
export function makeSnippet(body: string, query: string, radius = 90): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let idx = -1;
  for (const term of terms) {
    idx = flat.toLowerCase().indexOf(term);
    if (idx !== -1) break;
  }
  if (idx === -1) {
    return flat.length > radius * 2 ? flat.slice(0, radius * 2) + "…" : flat;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + radius);
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
}
