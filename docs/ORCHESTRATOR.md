# SmartCopilot — Agentic Orchestrator Specification

> Vision and design for milestones 2–4, captured 2026-06-10 before implementation.
> Status & sequencing live in [ROADMAP.md](ROADMAP.md).

## 1. Vision

When the user prompts Copilot with a development request, an **orchestrator** drives this
loop:

1. **Check memory** — consult the project memory (the M1 MCP server) for relevant
   decisions, patterns, and prior work.
2. **Decompose** — split the request into ordered **micro-tasks**.
3. **Document** — persist the plan and tasks into memory before any code is written.
4. **Delegate** — execute each micro-task through a **specialised agent running the
   cheapest adequate model**.
5. **Supervise & validate** — after each task: typecheck/build/tests green **plus a diff
   review against the task spec**; then request **final user validation**.
6. **Memorise** — once the user validates, write the outcome back to memory (decisions
   made, patterns discovered, summary of the development) so it is never re-derived.

## 2. Confirmed decisions (2026-06-10)

| Topic | Decision |
|-------|----------|
| Host | **GitHub Copilot** (unchanged from M1). The "CLAUDE.md" role is played by `.github/copilot-instructions.md` + a dedicated orchestrator custom agent. |
| Memory | **The existing M1 MCP memory server** (`.smartcopilot/memory/`). Plans, tasks, decisions and dev history are memories — no parallel `docs/` store. |
| Orchestrator form | **Hybrid: instructions + MCP tools.** The protocol lives in Copilot artifacts (agents/instructions); new MCP tools structure and persist each step. |
| Scope | **Continuation of SmartCopilot** — this spec realises milestones 2–4. |
| Agent execution | **Generated/committed Copilot custom agents** (`.github/agents/*.agent.md`). No direct API calls from the MCP server; everything stays inside the Copilot subscription. |
| Per-task validation | **Build + tests + diff review** against the task spec, then a single final user validation for the whole development. |
| Cost minimisation | **Static heuristics table** (task type → model tier) stored as memory, hand-tunable. Advisory: tools recommend, the orchestrator applies. |
| Trigger | **Complexity threshold.** Trivial questions/fixes → direct answer (memory consulted when relevant). Multi-file or feature-level work → full protocol. An explicit invocation path also exists (invoke the orchestrator agent directly). |

## 3. Enabling platform facts (verified 2026-06-10)

Copilot **custom agents** are markdown profiles in `.github/agents/*.agent.md` with YAML
frontmatter supporting (all surfaces — VS Code, CLI, coding agent):

- `description` (required), `name`, `target`
- **`model`** — per-agent model; inherits the default when unset. *This is the lever for
  cost-aware routing.*
- `tools` — allowlist, including MCP tools (e.g. `memory_search`) and the **`agent` tool
  (aliases `custom-agent`, `Task`) which lets one agent delegate to another**. *This is
  the lever for orchestration.*
- `disable-model-invocation` / `user-invocable` — control who can invoke the agent.

So the orchestrator is itself a custom agent that delegates micro-tasks to specialist
agents, each pinned to an adequate model.

Sources: [Custom agents configuration — GitHub Docs](https://docs.github.com/en/copilot/reference/custom-agents-configuration),
[Custom agents in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-agents).

## 4. Architecture

### 4.1 Copilot artifacts (committed)

```
.github/
  copilot-instructions.md      # triage rule: trivial → direct; dev work → orchestrator
  agents/
    orchestrator.agent.md      # the protocol (§5); tools: memory_*, task_*, agent
    explorer.agent.md          # read-only code exploration; ECO model
    implementer.agent.md       # code writing/editing; STANDARD model
    reviewer.agent.md          # diff review vs task spec; STANDARD model
    documenter.agent.md        # memory write-back, summaries; ECO model
```

Specialist agents are **handcrafted first**; a generator tool (from profiles stored in
memory) is a later refinement, only if profiles need to vary per project.

### 4.2 New MCP tools (on top of the M1 memory server)

| Tool | Milestone | Purpose |
|------|-----------|---------|
| `task_plan` | M2 | Persist a decomposition: one `type: plan` memory + N linked `type: task` memories (ordered, with spec & acceptance criteria). |
| `task_update` | M2 | Move a task through its lifecycle (`pending → in-progress → done / blocked`), attach validation results. |
| `task_list` | M2 | List tasks of the active plan (or filter by status) — resumable across sessions. |
| `model_suggest` | M4 | Given task type/size/risk, read the heuristics memory and return a tier + named model + rationale. |

Reuse everywhere: `MemoryStore`, wikilink graph, `memory_search`. Tools follow the
existing pattern (`src/tools/*`, registered in `src/server.ts`, covered in
`test/mcp.test.ts`).

### 4.3 Memory schema extensions

- New memory types: `plan`, `task` (alongside existing types). Tasks extend frontmatter
  with `status`, `plan` (wikilink to parent), `order`, and optionally `agent`/`model`
  used. This resolves the M2 open question: **tasks are first-class memories**, not a
  separate namespace — they inherit search, graph, index, watcher for free.
- Heuristics table: a single `type: reference` memory (e.g. `model-routing-heuristics`)
  holding the task-type → tier table. Hand-editable; `model_suggest` reads it live.
- Dev history: on final validation, the documenter writes a `type: decision`/`reference`
  memory summarising the development, linked to its plan via `[[…]]`.

### 4.4 Model tiers (initial heuristics — tune in memory)

| Tier | Intent | Task types |
|------|--------|-----------|
| **ECO** | Cheapest premium-request multiplier | exploration, summarisation, doc/memory write-back, classification |
| **STANDARD** | Default 1× model | implementation, tests, diff review |
| **FRONTIER** | High-multiplier model | architecture decisions, cross-cutting refactors, hard debugging |

Concrete model names live only in the heuristics memory and agent files (they churn);
this spec stays in tiers.

## 5. The orchestration protocol (orchestrator.agent.md contract)

1. **Triage.** Below the complexity threshold → answer directly. Otherwise continue.
2. **Recall.** `memory_search` / `memory_graph` for related decisions, patterns, prior
   plans. Surface what constrains the work.
3. **Plan.** Decompose into micro-tasks, each with a spec and acceptance criteria; call
   `task_plan`. Show the plan to the user (cheap checkpoint before spending).
4. **Execute.** For each task in order: `model_suggest` → delegate via the `agent` tool to
   the matching specialist → `task_update` to `in-progress`/`done`.
5. **Validate each task.** Typecheck/build/tests must pass; the reviewer agent checks the
   diff against the task spec. Failures loop back (bounded retries) or mark `blocked`.
6. **User validation.** Present the completed development (what changed, how it was
   verified). Wait for explicit approval.
7. **Memorise.** Only after approval: documenter agent writes the dev-summary memory,
   links decisions/patterns, closes the plan.

## 6. Mapping to milestones

- **M2 (Agentic workflow):** memory schema extensions (`plan`/`task`), `task_plan` /
  `task_update` / `task_list`, plus the `explorer` agent.
- **M3 (Specialised agents):** the `.github/agents/` suite incl. `orchestrator.agent.md`
  and the delegation flow. (Open question on the agent format: **resolved**, see §3.)
- **M4 (Cost-aware routing):** heuristics memory + `model_suggest`; per-agent `model`
  pinning in the agent files.

Recommended build order: **M2 → M3 → M4** — tasks must persist before delegation is
useful, and routing needs both.

## 7. Open questions (carry-over)

- **Cost telemetry (M4):** Copilot does not expose per-call cost to MCP servers — keep
  routing advisory; revisit if telemetry appears.
- **Retry budget (M5?):** how many failed validation loops before a task is escalated to
  a higher tier vs marked `blocked` for the user. Start with a constant (e.g. 2).
- **Concurrent plans:** assume one active plan per project initially; revisit if needed.
