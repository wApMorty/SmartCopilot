# SmartCopilot — Roadmap & Status

> Living document to resume work across sessions. Last updated: **2026-06-10**.
> Milestones 2–4 are now specified in **[ORCHESTRATOR.md](ORCHESTRATOR.md)** (the agentic
> orchestrator vision) — that spec is the authority for their design; this file tracks
> status and sequencing.

## 1. Context & vision

Improve a developer's **agentic** workflow under **GitHub Copilot** (VS Code agent mode +
Copilot CLI). Four pillars, built on a shared MCP foundation:

1. **MCP server with tools** — the integration surface Copilot calls.
2. **Local memory** — a markdown knowledge graph (Obsidian/Graphify/Ruflo style).
3. **Agentic workflow** — code exploration → task decomposition → routing to specialised
   agents.
4. **Cost-aware model routing** — pick the cheapest adequate model per task.

The strategy is to ship the **memory foundation first** (everything else persists state
through it) and layer the rest on top.

## 2. Validated decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Host | **GitHub Copilot** (VS Code + CLI) | User's target; mature MCP support in VS Code, CLI has its own MCP config. |
| Stack | **TypeScript / Node** | Official MCP SDK, `npx` distribution. |
| Memory store | **Markdown graph** (`.md` + `[[wikilinks]]`) | Transparent, git-versionable, Obsidian-compatible. |
| Search | **Lexical** (MiniSearch, in-memory) | No native deps; format stays open to a hybrid vector index later. |
| Memory scope | **Project, committed** to `.smartcopilot/memory/` | Shared with the team, tied to the code. |
| Population | **Auto (tools) + manual (file edits)** | Watcher re-indexes hand edits live. |
| Pillar 4 stance | **Complement** Copilot's auto model selection | Copilot already routes (GPT-5.4 / Sonnet 4.6 / Haiku 4.5, GA Apr 2026). |
| Orchestrator form (2026-06-10) | **Hybrid: Copilot instructions/agents + new MCP tools** | Protocol in `.github/agents/*.agent.md`; tools persist each step. See [ORCHESTRATOR.md](ORCHESTRATOR.md). |
| Agent execution (2026-06-10) | **Copilot custom agents** with per-agent `model` + `agent` delegation tool | Verified: supported on all surfaces; no separate API billing. |
| Validation (2026-06-10) | **Build + tests + diff review per task**, single final user validation | Then memory write-back, only after user approval. |
| Cost routing (2026-06-10) | **Static heuristics memory** (task type → tier), advisory | Hand-tunable; Copilot exposes no cost telemetry to MCP. |
| Trigger (2026-06-10) | **Complexity threshold** | Trivial → direct answer; multi-file/feature → full protocol. |

## 3. Milestone 1 — Memory MCP server ✅ DONE

Delivered and verified (`npm run typecheck`, `npm run build`, **27 vitest tests green**,
stdio smoke test, in-process MCP client test).

### Tools

| Tool | Status |
|------|--------|
| `memory_search` | ✅ full-text + type/tags filters, ranked, snippets |
| `memory_read` | ✅ frontmatter + body + outgoing/broken links + backlinks |
| `memory_write` | ✅ create/update, near-duplicate flagging, regenerates `INDEX.md` |
| `memory_list` | ✅ recent-first, type/tag filters |
| `memory_graph` | ✅ neighbourhood, depth 1–2 |
| `memory_delete` | ✅ removes file, reports newly broken backlinks |

### Implementation notes / invariants

- `MemoryStore` (`src/memory/vault.ts`) is the in-memory authority; disk `.md` files are
  the source of truth, re-read on `reload()`.
- Mutating ops (`write`/`delete`/`reload`) are **serialised by a mutex**; reads are
  synchronous snapshots. Real MCP usage is sequential request/response, so reads always
  observe committed state in practice.
- Writes are **atomic** (temp file + rename, with `EXDEV` copy fallback).
- Watcher (`chokidar`) ignores generated files (`INDEX.md`) and debounces re-indexing.
- `INDEX.md` is generated (grouped by type) — never a source of truth.

### Integration shipped

- `.vscode/mcp.json` — runs `node dist/index.js` for VS Code agent mode.
- `.github/copilot-instructions.md` — nudges Copilot to consult/write memory.
- `README.md` — setup for VS Code + Copilot CLI, tool reference, vault format.

### Known limitations / deferred

- Search is lexical only (no semantic recall on large vaults). Format is ready for a
  vector index without migration.
- No memory cache file (`_index.json`): the vault is re-scanned on startup — fast for
  project-sized vaults; revisit if startup becomes slow.
- Memory scope is project-only; a cross-project user vault (preferences) would need a
  two-vault merge with precedence.

## 4. Milestone 2 — Agentic workflow ✅ DONE (2026-06-10)

Goal: structure **task decomposition**, persisting plans/tasks into the memory built in
M1. Design: [ORCHESTRATOR.md](ORCHESTRATOR.md) §4.2–4.3, §6.

Delivered (typecheck + build green, **31 vitest tests**):
- Memory schema extensions: `type: plan` (`status: active|closed`) and `type: task`
  (`status: pending|in-progress|done|blocked`, `plan` link, `order`, `agent`, `model`).
  Workflow fields are type-gated, omitted from serialisation when unset (existing
  memories round-trip unchanged), and hand-written files get sensible defaults.
  `INDEX.md` shows the status inline.
- Tools: `task_plan` (persists a plan + ordered tasks with specs/acceptance criteria,
  flags other active plans, refuses slug collisions), `task_update` (lifecycle + `## Log`
  notes + agent/model recording; also closes plans, warning on unfinished tasks),
  `task_list` (defaults to the single active plan; progress counts + next pending task).
- `.github/agents/explorer.agent.md` — read-only exploration agent (ECO model) writing
  findings back as memories; `.github/copilot-instructions.md` now describes the
  plan/task workflow with its complexity threshold.

## 5. Milestone 3 — Specialised agents / routing ✅ DONE (2026-06-10)

Goal: route subtasks to specialised agents. **Format question resolved (2026-06-10):**
Copilot custom agents live in `.github/agents/*.agent.md` and support per-agent `model`
plus an `agent` tool (alias `Task`) for delegation — true orchestration is possible
inside Copilot. Design: [ORCHESTRATOR.md](ORCHESTRATOR.md) §3–5.

Delivered (markdown artifacts only — no code change; frontmatter parse-checked):
- The committed agent suite in `.github/agents/`: **orchestrator** (protocol owner —
  triage, recall, plan w/ user go, delegate, supervise, user-validation gate, memorise;
  no edit/execute tools, Sonnet), **implementer** (one task spec, runs checks, Sonnet),
  **reviewer** (diff vs spec/acceptance criteria, explicit APPROVE/REQUEST_CHANGES
  verdict, read-only + execute, Sonnet), **documenter** (summary memories + plan close
  after user approval, Haiku), plus **explorer** from M2 (Haiku).
- Retry budget: 2 implementer retries per task on REQUEST_CHANGES, then `blocked`.
- Triage rule in `.github/copilot-instructions.md` routes feature work to the
  orchestrator (with an inline-protocol fallback for surfaces without delegation).
- Tool aliases verified: `read`/`edit`/`search`/`execute`/`agent`/`web`/`todo`,
  MCP via `smartcopilot/<tool>` or `smartcopilot/*`.

A profile registry/generator remains a possible later refinement.

## 6. Milestone 4 — Cost-aware model routing ✅ DONE (2026-06-10)

Goal: **complement** Copilot's auto model selection with per-task heuristics + cost
awareness. Design: [ORCHESTRATOR.md](ORCHESTRATOR.md) §4.4.

Delivered (typecheck + build green, **32 vitest tests**):
- `model_suggest` — task type/size/risk → tier (eco/standard/frontier) + model +
  rationale. `risk: high` and `size: large` each escalate one step; unknown types fall
  back to standard (and say so). Advisory only.
- Heuristics live in the `model-routing-heuristics` memory (markdown tables, re-parsed
  on every call, hand-tunable; seeded with defaults on first use).
- Per-agent `model` pinning in the `.agent.md` files is the enforcement mechanism; the
  orchestrator warns the user before any frontier-tier task instead of silently burning
  a high-multiplier request.

Cost telemetry: Copilot exposes none to MCP servers — routing stays advisory.

## 6b. Deliverability ✅ DONE (2026-06-10)

Distribution is **GitHub-only** (no npm registry), decided 2026-06-10:
- `smartcopilot-mcp init` (new `src/cli.ts` + `src/scaffold.ts`) installs the per-repo
  artifacts into a consumer project — agents, copilot-instructions section (appended,
  never clobbered), `.vscode/mcp.json`, vault dir. Idempotent; the package's own
  `.github/` files are the single-source templates (shipped via `files`).
- Consumers: `npm i -D github:OWNER/smartcopilot` (the `prepare` script builds `dist/`
  on git install) then `npx smartcopilot-mcp init`. Release tarballs work too.
- CI (`.github/workflows/`): tests on push/PR (Node 20+22); `git tag vX.Y.Z` →
  GitHub Release with the `npm pack` tarball.
- Repo: git initialised (main), initial commit done. **Remote not yet created** —
  needs `gh` or a manually created GitHub repo, then `git push -u origin main`.
- 35 vitest tests (3 new for the scaffolder).

## 7. Milestone 5 — Observability & feedback loop ✅ DONE (2026-06-10)

Post-v0.1 direction (decided 2026-06-10): the remaining risk is not technical but
**behavioural** — do Copilot agents actually call the tools, delegate, respect the
protocol? So before adding features, instrument real usage and dogfood.

Delivered (`v0.2.0`, 42 vitest tests):
- **Usage journal** (`src/usage.ts`): every tool call is appended as one JSONL line
  (`ts`, `tool`, `ms`, `ok`, summarised `args`, `error`) to
  `.smartcopilot/logs/tool-calls.jsonl`. Implemented by patching `registerTool` once in
  `createServer` — tool modules stay untouched. Args are summarised (long strings
  truncated, nested structures collapsed) so memory bodies never land in the log.
  `SMARTCOPILOT_USAGE_LOG` overrides the path or disables (`off`/`0`). Appends are
  chained (no interleaving), fire-and-forget, and can never fail a tool call.
  Note: calls rejected by schema validation never reach the handler, so they are
  **not** journalled — the journal measures handler executions.
- **`smartcopilot-mcp stats`** (`src/stats.ts`): aggregates the journal per tool
  (calls, errors, avg/max ms, time range) for the dogfooding review.
- `init` now ensures `.smartcopilot/logs/` is in the consumer's `.gitignore`
  (created/appended/skipped — never clobbered); journal is per-developer, never committed.

**In progress (user): dogfooding** on other real projects to collect journal data.
Review after ~1 week of usage: which tools get called/ignored, error rates, whether
the orchestrator protocol triggers — then tune tool descriptions, the complexity
threshold and `model-routing-heuristics` on that data.

## 8. Backlog — next milestones (prioritised 2026-06-10)

Ordered; do **M6 only after** the first dogfooding review (its data decides priorities).

### M6 — Memory hygiene (vaults rot)
- `memory_verify` tool (or a documenter pass): flag stale memories — broken wikilinks
  (already detected), file paths that no longer exist in the repo, memories not
  confirmed for N months (`last-confirmed` frontmatter date, refreshed on read/update).
- Possibly a `memory_compact` review flow for near-duplicates beyond write-time flagging.

### M7 — Routing feedback loop
- Record task outcomes (first-pass success / retries / blocked) by joining the usage
  journal with `task_update` transitions; use it to re-tune `model-routing-heuristics`
  on real data. Design question: derive offline (stats command) vs persist on the task.

### M8 — Deeper Copilot integration
- **MCP prompts** (`/recall`, `/plan`, `/standup`): discoverable slash-commands in
  VS Code instead of relying on the agent's initiative.
- **MCP resources**: expose `INDEX.md` + memories as attachable context.
- **Git anchoring**: record the commit/branch that realised each task in its `## Log`.

### M9 — Hybrid semantic search
- Local embeddings (fastembed / transformers.js), gitignored `_index.json` cache,
  score fusion with MiniSearch. Format already migration-free. Only worth it once
  dogfooding shows lexical recall failing on real vault sizes.

### M10 — User-global vault
- Cross-project preferences vault merged under project-precedence (open question
  carried over from v0.1).

Still open (carried over): retry budget tuning (start 2), concurrent plans (one active
plan assumed).

## 9. How to resume

1. Read `CLAUDE.md` (orientation), this file, and `ORCHESTRATOR.md` (design).
2. `npm install && npm run build && npm test` — expect 42 green.
3. v0.2.0 shipped (5 milestones). Next: dogfooding review (§7), then the backlog (§8)
   in order — M6 first, reprioritised by journal data.
4. Reuse `MemoryStore` and the existing tool pattern (`src/tools/*` + register in
   `src/server.ts` + cover in `test/mcp.test.ts`).
