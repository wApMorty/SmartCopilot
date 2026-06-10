import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";

/** Files the store generates itself — watching them would cause loops. */
function isGenerated(filePath: string): boolean {
  const base = path.basename(filePath);
  return base === "INDEX.md" || base === "_index.json";
}

/**
 * Watch the vault for external (manual) edits and invoke `onChange`, debounced.
 * This is what makes the "manual" half of the workflow work: a human editing a
 * `.md` in their editor or Obsidian transparently refreshes the index.
 */
export function watchVault(dir: string, onChange: () => void): FSWatcher {
  const watcher = chokidar.watch(dir, {
    ignored: (p: string) => isGenerated(p),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  let timer: NodeJS.Timeout | undefined;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  };

  watcher
    .on("add", trigger)
    .on("change", trigger)
    .on("unlink", trigger);

  return watcher;
}
