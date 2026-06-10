# CLAUDE.md — SmartCopilot

Orientation for any future session. Full status & plan: **[docs/ROADMAP.md](docs/ROADMAP.md)**.

## What this is

An MCP server (TypeScript) that gives **GitHub Copilot** (VS Code agent mode + Copilot
CLI) a persistent, **project-scoped markdown-graph memory** (Obsidian-style). It is the
foundation of a 4-pillar toolkit to improve agentic development.

## Status (2026-06-10)

- **Milestone 1 — Memory MCP server: DONE & tested.** 6 tools, MiniSearch full-text,
  wikilink graph, generated `INDEX.md`, atomic + mutex-serialised writes, chokidar watcher.
- **Milestone 2 — Agentic workflow: DONE & tested.** `plan`/`task` memory types with
  lifecycle frontmatter, `task_plan`/`task_update`/`task_list` tools, workflow section
  in copilot-instructions.
- **Milestone 3 — Specialised agents: DONE.** Agent suite in `.github/agents/`
  (`orchestrator` delegating to `explorer`/`implementer`/`reviewer`/`documenter`, each
  with a cost-appropriate `model`), triage rule in copilot-instructions.
- **Milestone 4 — Cost-aware routing: DONE & tested.** `model_suggest` + hand-tunable
  `model-routing-heuristics` memory (10 tools total, 32 tests).
- **All four pillars shipped.** Design reference: **[docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md)**.
- **Deliverability: DONE.** GitHub-only distribution (`github.com/wApMorty/SmartCopilot`);
  `smartcopilot-mcp init` scaffolds consumer repos (`src/cli.ts`/`src/scaffold.ts`);
  CI + tarball release on tag.
- **Milestone 5 — Observability: DONE (v0.2.0).** JSONL usage journal of every tool call
  (`src/usage.ts` → `.smartcopilot/logs/`, gitignored) + `smartcopilot-mcp stats`
  (`src/stats.ts`). **Current phase: user is dogfooding on real projects** — next step is
  the journal review, then the backlog in ROADMAP §8 (hygiene, routing feedback, MCP
  prompts/resources, semantic search).

## Key decisions (don't re-litigate without reason)

- Host = **GitHub Copilot** (not Claude Code).
- Memory = **markdown graph** (`.md` + `[[wikilinks]]`), **lexical** search (MiniSearch),
  no vectors yet — format stays open to a hybrid vector index later.
- Memory scope = **project, committed** to `.smartcopilot/memory/`.
- Populated **auto** (tools) **+ manual** (hand-edited files, re-indexed live).
- Pillar 4 must **complement** Copilot's built-in auto model selection, not duplicate it.
- Orchestrator (2026-06-10) = **hybrid**: protocol in `.github/agents/*.agent.md` (custom
  agents support per-agent `model` + `agent` delegation tool) + new MCP tools
  (`task_plan`/`task_update`/`task_list`/`model_suggest`); tasks are first-class memories.

## Commands

```bash
npm install
npm run build        # tsup -> dist/{index,cli}.js
npm test             # vitest (42 tests)
npm run typecheck    # tsc --noEmit
npm run dev          # run from source (tsx)
npm run inspect      # build + MCP Inspector
```

## Architecture map

- `src/index.ts` — stdio entry: load vault, start watcher, connect server. **stdout is the
  MCP channel — never log to stdout, use stderr.**
- `src/server.ts` — builds `McpServer`, registers the 10 tools (journalled via
  `src/usage.ts` when a `UsageLog` is passed).
- `src/memory/vault.ts` — `MemoryStore`: in-memory authority (doc map + index + graph),
  `write`/`delete`/`reload` serialised by a mutex; disk `.md` files are the source of truth.
- `src/memory/{frontmatter,graph,search,indexFile,watcher}.ts` — focused helpers.
- `src/tools/*` — one file per MCP tool; descriptions are written for the agent to know
  *when* to call them.
- `test/*` — vitest, incl. `mcp.test.ts` (in-process MCP client via InMemoryTransport).

## Conventions

- ESM, Node ≥20, strict TS. Tool results return JSON as a text content block
  (see `src/tools/helpers.ts`).
- One fact per memory; link related memories with `[[slug]]`.
- When you add a tool: register it in `src/server.ts` and cover it in `test/mcp.test.ts`.
