---
name: model-routing-heuristics
description: Task-type → model-tier routing table used by model_suggest (hand-tunable)
type: reference
tags:
  - routing
  - cost
created: '2026-06-10T09:42:47.180Z'
updated: '2026-06-10T09:42:47.180Z'
source: auto
---
Maps task types to model tiers for cost-aware routing. Edit freely: `model_suggest`
re-reads this memory on every call. Tier escalates one step when risk is high or size is
large. Model names must match your Copilot model picker.

## Task types

| task type | tier |
|-----------|------|
| exploration | eco |
| summarisation | eco |
| documentation | eco |
| classification | eco |
| implementation | standard |
| tests | standard |
| review | standard |
| architecture | frontier |
| cross-cutting-refactor | frontier |
| hard-debugging | frontier |

## Tiers

| tier | model |
|------|-------|
| eco | Claude Haiku 4.5 |
| standard | Claude Sonnet 4.6 |
| frontier | GPT-5.4 |
