import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { MemoryStore } from "./memory/vault.js";
import { watchVault } from "./memory/watcher.js";
import { createServer } from "./server.js";

/**
 * Entry point: load the vault, watch it for manual edits, and serve the MCP
 * tools over stdio (how Copilot launches a local server). Everything that is
 * not protocol traffic goes to stderr — stdout is the MCP channel.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const store = new MemoryStore(config);
  await store.reload();

  let reloading = false;
  const watcher = watchVault(config.vaultDir, async () => {
    if (reloading) return;
    reloading = true;
    try {
      await store.reload();
    } catch (err) {
      process.stderr.write(`[smartcopilot] reload failed: ${String(err)}\n`);
    } finally {
      reloading = false;
    }
  });

  const server = createServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[smartcopilot] ready — vault ${config.vaultDir} (${store.size} memories)\n`,
  );

  const shutdown = async () => {
    await watcher.close();
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[smartcopilot] fatal: ${err?.stack ?? String(err)}\n`);
  process.exit(1);
});
