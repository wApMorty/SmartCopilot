import { scaffold } from "./scaffold.js";

/**
 * Bin entry. `smartcopilot-mcp` with no argument starts the MCP server over
 * stdio (what the host launches); `smartcopilot-mcp init` scaffolds the
 * per-repo artifacts into the current project.
 */
const command = process.argv[2];

if (command === undefined) {
  await import("./index.js");
} else if (command === "init") {
  const { actions, notes } = await scaffold(process.cwd());
  for (const { target, status } of actions) {
    console.log(`${status.padEnd(8)} ${target}`);
  }
  console.log("");
  for (const note of notes) console.log(`- ${note}`);
} else {
  console.error(`Unknown command "${command}".\n\nUsage:\n  smartcopilot-mcp        start the MCP server (stdio)\n  smartcopilot-mcp init   install the Copilot artifacts into the current project`);
  process.exit(1);
}
