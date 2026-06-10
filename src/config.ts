import path from "node:path";

export interface Config {
  /** Directory holding the `*.md` memory files. */
  vaultDir: string;
  /** Human-readable generated index, committed alongside the memories. */
  indexFile: string;
}

/**
 * Resolve where the memory vault lives.
 *
 * Precedence:
 *   1. `SMARTCOPILOT_VAULT` env var (absolute or relative to cwd).
 *   2. `<cwd>/.smartcopilot/memory` — the project-local, git-committed default.
 *
 * Copilot launches the MCP server with the workspace root as cwd, so the
 * default lands the vault inside the user's repository.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Config {
  const override = env.SMARTCOPILOT_VAULT?.trim();
  const vaultDir = override
    ? path.resolve(cwd, override)
    : path.resolve(cwd, ".smartcopilot", "memory");
  return {
    vaultDir,
    indexFile: path.join(vaultDir, "INDEX.md"),
  };
}
