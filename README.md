# SmartCopilot

An MCP server and agent suite that give **GitHub Copilot** (VS Code agent mode and the
Copilot CLI) a **persistent, project-scoped memory** plus an **agentic orchestrator**:
memory recall → micro-task planning → delegation to specialised custom agents on
cost-appropriate models → supervised validation → memory write-back. Design reference:
[docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md).

## Install in your project

The package is distributed from GitHub (no npm registry):

```bash
# 1. Add the server to your project (builds itself on install)
npm i -D github:wApMorty/SmartCopilot    # or download the .tgz from a GitHub Release
                                         #    and: npm i -D ./smartcopilot-mcp-x.y.z.tgz

# 2. Scaffold the Copilot artifacts into your repo
npx smartcopilot-mcp init
```

`init` installs (never overwriting what exists): the agent suite in `.github/agents/`,
the memory/workflow section of `.github/copilot-instructions.md` (appended if you
already have one), a `.vscode/mcp.json` and the `.smartcopilot/memory/` vault. Commit
all of it — the memory belongs to the repo. Then reload VS Code, enable the
**smartcopilot** server in Copilot Chat (Agent mode), and invoke the **orchestrator**
agent for feature-level work.

Non-Node project? Clone this repo, `npm install && npm run build`, and point your
`mcp.json` at `node <clone>/dist/index.js` instead.

## Why

Copilot starts every session cold. SmartCopilot persists the **decisions, patterns,
gotchas, references and preferences** discovered while working, so the next session can
recall and reuse them instead of re-deriving (or contradicting) them. The memory lives in
your repo as plain `.md` files — readable in a diff, editable by hand, and a valid
**Obsidian vault**.

## Memory format

One fact per file, in `.smartcopilot/memory/*.md`:

```markdown
---
name: retry-policy            # stable kebab-case slug = wikilink target = filename
description: HTTP retries use exponential backoff   # one-line summary
type: decision                # decision | pattern | gotcha | reference | preference | todo
tags: [http, resilience]
created: 2026-06-04T10:00:00.000Z
updated: 2026-06-04T10:00:00.000Z
source: auto                  # auto = written by the agent, manual = by a human
---

Cap retries at 5 attempts. Related: [[http-client]].
```

- The vault is **committed to the repo** and shared with your team.
- A generated `INDEX.md` gives a human-readable, grouped overview (don't edit it).
- The agent writes memories via the tools (**auto**); you can also create/edit files by
  hand (**manual**) — a file watcher re-indexes manual edits live.

## Tools

| Tool | Purpose |
|------|---------|
| `memory_search` | Full-text search (filter by type/tags), ranked, with snippets. |
| `memory_read` | Read one memory: frontmatter, body, outgoing links, broken links, backlinks. |
| `memory_write` | Create/update a memory; flags near-duplicates; regenerates `INDEX.md`. |
| `memory_list` | List memories (recent first), filter by type/tag. |
| `memory_graph` | Neighbourhood of a memory (outgoing, backlinks, broken), depth 1–2. |
| `memory_delete` | Remove a memory; reports backlinks that now dangle. |
| `task_plan` | Persist a development plan: one `plan` memory + ordered `task` memories with specs and acceptance criteria. |
| `task_update` | Advance a task (`pending → in-progress → done/blocked`), log notes, record agent/model; closes plans. |
| `task_list` | Tasks of a plan in order, with progress counts and the next pending task (resume across sessions). |
| `model_suggest` | Cost-aware, advisory tier/model recommendation per task (eco/standard/frontier), driven by the hand-tunable `model-routing-heuristics` memory. |

Plans and tasks are ordinary memories (`type: plan` / `type: task`) with lifecycle
frontmatter (`status`, `plan`, `order`) — searchable, linkable and hand-editable like
everything else in the vault.

## Custom agents (orchestration)

`.github/agents/` ships a Copilot custom-agent suite built on these tools. Invoke
**orchestrator** for any multi-file or feature-level work: it recalls memory, persists a
micro-task plan (`task_plan`), waits for your go, then delegates each task — to
**explorer** (read-only investigation), **implementer** (code + checks) and **reviewer**
(diff vs the task's acceptance criteria) — and, only after you validate the result, has
**documenter** write the summary memories and close the plan. Each agent pins a
cost-appropriate `model` in its frontmatter; adjust the names to your Copilot model
picker.

## Setup

```bash
npm install
npm run build
```

### VS Code (Copilot agent mode)

A ready-to-use `.vscode/mcp.json` is included (it runs `node dist/index.js`). Reload the
window, open Copilot Chat → **Agent**, open the tools picker and enable **smartcopilot**.

### Copilot CLI

Add the server to the CLI's MCP configuration, then verify with `/mcp`:

```bash
# from the project root, after `npm run build`
copilot  # then inside the session:
# /mcp add  → name: smartcopilot, command: node, args: <abs path>/dist/index.js
```

Or declare it once in `~/.copilot/mcp-config.json` (loaded automatically by every CLI
session):

```json
{
  "mcpServers": {
    "smartcopilot": {
      "type": "local",
      "command": "node",
      "args": ["/absolute/path/to/SmartCopilot/dist/index.js"],
      "env": {},
      "tools": ["*"]
    }
  }
}
```

(See GitHub's docs: *Adding MCP servers for GitHub Copilot CLI*.)

### Claude Code

A project-scoped `.mcp.json` is included: Claude Code sessions opened in this repo load
the **smartcopilot** server automatically (approve it once when prompted). A
`SessionStart` hook in `.claude/settings.json` rebuilds `dist/index.js` at session start
so the server never serves stale code.

### Make Copilot actually use it

`.github/copilot-instructions.md` tells Copilot to consult the memory at the start of a
task and to save notable findings. That instruction file is what turns "available tools"
into a habit.

## Configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `SMARTCOPILOT_VAULT` | `<cwd>/.smartcopilot/memory` | Vault directory. |

## Development

```bash
npm run dev        # run the server from source (tsx)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run inspect    # build + open the MCP Inspector against the server
```

## Roadmap

1. **Memory (this milestone).**
2. **Agentic workflow** — tools to structure code exploration and task decomposition,
   persisting tasks into memory.
3. **Specialised agents / routing** — mapped onto Copilot's custom agents / prompt files.
4. **Cost-aware model routing** — a *complement* to Copilot's built-in auto model
   selection: per-task advice + cost tracking persisted in memory.

## Notes

- Search is **lexical** (MiniSearch). The file format is intentionally open to adding a
  vector index later (hybrid) without migration.
- Dev-only `npm audit` warnings come from the vite/esbuild test toolchain and do not ship
  in the server.
