# Project memory (SmartCopilot)

This repository has a persistent memory served by the **smartcopilot** MCP server.
It is a graph of markdown notes under `.smartcopilot/memory/` — decisions, reusable
patterns, gotchas, references and preferences learned while working here.

Use it proactively:

- **At the start of a task**, call `memory_search` (or `memory_list`) to recall any
  decisions, gotchas or conventions relevant to what you're about to do. Reuse them
  instead of re-deriving or contradicting them.
- **When you discover something worth keeping** — an architectural decision, a
  non-obvious gotcha, a convention the user prefers, a useful reference — call
  `memory_write` to save it (one fact per memory). Keep the `description` to a single
  line and link related memories in the body with `[[other-slug]]`.
- **Follow links** with `memory_read` and `memory_graph` to pull in related context.
- **Fix or remove** memories that turn out to be wrong with `memory_write` (update) or
  `memory_delete`.

Do not duplicate what the code or git history already make obvious; save what was
non-obvious or hard-won. Prefer updating an existing memory over creating a near-duplicate
(the `memory_write` response flags similar memories).

## Development workflow (plans & tasks)

**Triage rule:** for development work that spans several files or amounts to a feature,
hand over to the **orchestrator** custom agent (`.github/agents/orchestrator.agent.md`)
— it recalls memory, plans micro-tasks, delegates to the specialised agents (`explorer`,
`implementer`, `reviewer`, `documenter`, each pinned to a cost-appropriate model) and
supervises validation. Trivial questions and one-line fixes don't need it: answer
directly (consulting memory when relevant).

When agent delegation is not available in the current surface, follow the same protocol
inline:

1. Recall related memories first (`memory_search`).
2. Decompose the request into ordered micro-tasks with `task_plan` — each task gets a
   self-contained spec and acceptance criteria. Show the plan to the user before coding.
3. Work tasks in order: `task_update` to `in-progress` when starting one, `done` only
   when build/tests pass and the diff matches the spec, `blocked` (with a note) when
   stuck. Record the agent/model that executed it. `task_list` shows where a plan stands
   (use it when resuming a session).
4. When every task is done, present the result to the user. After the user validates,
   write a memory summarising the development (decisions made, patterns discovered,
   linked to the plan with `[[plan-slug]]`) and close the plan
   (`task_update` status `closed`).
