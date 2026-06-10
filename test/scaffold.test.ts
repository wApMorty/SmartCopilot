import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempVaultDir } from "../src/memory/vault.js";
import { scaffold } from "../src/scaffold.js";

// The repo itself plays the role of the installed package (same layout).
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let targetDir: string;

beforeEach(async () => {
  targetDir = await makeTempVaultDir("smartcopilot-scaffold-");
});

afterEach(async () => {
  await fs.rm(targetDir, { recursive: true, force: true });
});

describe("scaffold (init command)", () => {
  it("installs agents, instructions, mcp.json and the vault dir", async () => {
    const { actions } = await scaffold(targetDir, packageRoot);

    const agents = await fs.readdir(path.join(targetDir, ".github", "agents"));
    expect(agents.sort()).toEqual([
      "documenter.agent.md",
      "explorer.agent.md",
      "implementer.agent.md",
      "orchestrator.agent.md",
      "reviewer.agent.md",
    ]);

    const instructions = await fs.readFile(
      path.join(targetDir, ".github", "copilot-instructions.md"),
      "utf8",
    );
    expect(instructions).toContain("# Project memory (SmartCopilot)");

    await fs.access(path.join(targetDir, ".vscode", "mcp.json"));
    await fs.access(path.join(targetDir, ".smartcopilot", "memory"));
    expect(actions.every((a) => a.status === "created")).toBe(true);
  });

  it("is idempotent: a second run touches nothing", async () => {
    await scaffold(targetDir, packageRoot);
    const before = await fs.readFile(
      path.join(targetDir, ".github", "copilot-instructions.md"),
      "utf8",
    );

    const { actions } = await scaffold(targetDir, packageRoot);
    expect(actions.every((a) => a.status === "skipped")).toBe(true);

    const after = await fs.readFile(
      path.join(targetDir, ".github", "copilot-instructions.md"),
      "utf8",
    );
    expect(after).toBe(before);
  });

  it("appends to existing instructions without clobbering them", async () => {
    const dst = path.join(targetDir, ".github");
    await fs.mkdir(dst, { recursive: true });
    await fs.writeFile(path.join(dst, "copilot-instructions.md"), "# My own rules\n\nKeep me.\n");

    const { actions } = await scaffold(targetDir, packageRoot);
    const entry = actions.find((a) => a.target.endsWith("copilot-instructions.md"));
    expect(entry?.status).toBe("appended");

    const merged = await fs.readFile(path.join(dst, "copilot-instructions.md"), "utf8");
    expect(merged).toContain("# My own rules");
    expect(merged).toContain("# Project memory (SmartCopilot)");
  });

  it("gitignores the usage journal, preserving an existing .gitignore", async () => {
    await fs.writeFile(path.join(targetDir, ".gitignore"), "node_modules/\n");

    const { actions } = await scaffold(targetDir, packageRoot);
    expect(actions.find((a) => a.target === ".gitignore")?.status).toBe("appended");

    const ignore = await fs.readFile(path.join(targetDir, ".gitignore"), "utf8");
    expect(ignore).toContain("node_modules/");
    expect(ignore).toContain(".smartcopilot/logs/");

    const again = await scaffold(targetDir, packageRoot);
    expect(again.actions.find((a) => a.target === ".gitignore")?.status).toBe("skipped");
  });
});
