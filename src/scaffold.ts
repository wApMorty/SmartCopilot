import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `smartcopilot-mcp init` — install the per-repo artifacts into a consumer
 * project: the Copilot agent suite, the copilot-instructions workflow section,
 * a `.vscode/mcp.json` and the memory vault directory. Never overwrites: an
 * existing file is reported and left untouched.
 *
 * The templates are the package's own `.github/` files (single source of
 * truth, shipped via the `files` field of package.json).
 */

/** Section heading used to detect whether instructions were already merged. */
const INSTRUCTIONS_MARKER = "# Project memory (SmartCopilot)";

const MCP_JSON_TEMPLATE = `{
  // SmartCopilot memory MCP server (requires the smartcopilot-mcp package,
  // e.g. \`npm i -D github:wApMorty/SmartCopilot\`).
  "servers": {
    "smartcopilot": {
      "type": "stdio",
      "command": "npx",
      "args": ["smartcopilot-mcp"]
    }
  }
}
`;

export interface ScaffoldAction {
  target: string;
  status: "created" | "skipped" | "appended";
}

export interface ScaffoldResult {
  actions: ScaffoldAction[];
  notes: string[];
}

/** Root of the installed smartcopilot-mcp package (this file lives in dist/). */
export function defaultPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function exists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

export async function scaffold(
  targetDir: string,
  packageRoot: string = defaultPackageRoot(),
): Promise<ScaffoldResult> {
  const actions: ScaffoldAction[] = [];
  const notes: string[] = [];
  const act = (target: string, status: ScaffoldAction["status"]) =>
    actions.push({ target, status });

  // 1. Agent suite.
  const agentsSrc = path.join(packageRoot, ".github", "agents");
  const agentsDst = path.join(targetDir, ".github", "agents");
  await fs.mkdir(agentsDst, { recursive: true });
  for (const entry of await fs.readdir(agentsSrc)) {
    if (!entry.endsWith(".agent.md")) continue;
    const dst = path.join(agentsDst, entry);
    if (await exists(dst)) {
      act(path.join(".github", "agents", entry), "skipped");
      continue;
    }
    await fs.copyFile(path.join(agentsSrc, entry), dst);
    act(path.join(".github", "agents", entry), "created");
  }

  // 2. Copilot instructions: copy when absent, append our section when the
  // consumer already has instructions of their own.
  const instructionsSrc = path.join(packageRoot, ".github", "copilot-instructions.md");
  const instructionsDst = path.join(targetDir, ".github", "copilot-instructions.md");
  const instructionsBody = await fs.readFile(instructionsSrc, "utf8");
  if (!(await exists(instructionsDst))) {
    await fs.writeFile(instructionsDst, instructionsBody, "utf8");
    act(path.join(".github", "copilot-instructions.md"), "created");
  } else {
    const current = await fs.readFile(instructionsDst, "utf8");
    if (current.includes(INSTRUCTIONS_MARKER)) {
      act(path.join(".github", "copilot-instructions.md"), "skipped");
    } else {
      await fs.writeFile(instructionsDst, `${current.trimEnd()}\n\n${instructionsBody}`, "utf8");
      act(path.join(".github", "copilot-instructions.md"), "appended");
    }
  }

  // 3. VS Code MCP config.
  const mcpDst = path.join(targetDir, ".vscode", "mcp.json");
  if (await exists(mcpDst)) {
    act(path.join(".vscode", "mcp.json"), "skipped");
    notes.push(
      `.vscode/mcp.json already exists — add a "smartcopilot" server entry yourself ` +
        `(stdio, command "npx", args ["smartcopilot-mcp"]).`,
    );
  } else {
    await fs.mkdir(path.dirname(mcpDst), { recursive: true });
    await fs.writeFile(mcpDst, MCP_JSON_TEMPLATE, "utf8");
    act(path.join(".vscode", "mcp.json"), "created");
  }

  // 4. Memory vault (INDEX.md is generated on first server run).
  const vaultDir = path.join(targetDir, ".smartcopilot", "memory");
  const hadVault = await exists(vaultDir);
  await fs.mkdir(vaultDir, { recursive: true });
  act(path.join(".smartcopilot", "memory") + path.sep, hadVault ? "skipped" : "created");

  notes.push(
    "Commit .github/, .vscode/mcp.json and .smartcopilot/memory/ — the memory is project-scoped and shared with the team.",
    "Check that the model names in .github/agents/*.agent.md match your Copilot model picker.",
    "In VS Code: reload the window, open Copilot Chat (Agent mode) and enable the smartcopilot server, then invoke the orchestrator agent for feature work.",
  );
  return { actions, notes };
}
