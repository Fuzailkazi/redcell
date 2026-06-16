# RedCell — Build Plan

> Working plan for building RedCell in thin slices, one phase per tool.
> Source of truth for *what* and *why*: `CLAUDE.md`. This file tracks *how* and *order*.

---

## Phase 1 — LangChain.js (the attacker brain)

**Goal:** one technique → one attack → one scored `AttackResult`.

**Done when:** `pnpm tsx src/run.ts --technique direct_injection` prints a scored `AttackResult`.

### Decisions (locked defaults — change before/while building)

| # | Decision | Default | Notes |
|---|----------|---------|-------|
| 1 | Model provider | **OpenAI** (`@langchain/openai`, `gpt-4o-mini` for Phase 1) | Swappable via single factory (`MODEL_PROVIDER=anthropic` also works). |
| 2 | Phase-1 target | **Self-contained weak LLM** in `targets.ts` (naive system prompt guarding a fake secret + a mock tool) | Safe, reproducible, attacks can actually land. |
| 3 | Attacker payloads | **Static seed payloads** per technique (no LLM crafting yet) | Cheap, deterministic, easy to judge. Can go dynamic later. |
| 4 | Package manager | **pnpm** | Per CLAUDE.md. |
| 5 | LangSmith | **Tracing wired, optional at runtime** (no crash if key unset) | Real eval work is Phase 3. |

### Build order

- [ ] **0. Scaffold** — `package.json` (ESM, `"type":"module"`, scripts), `tsconfig.json` (strict), `.env.example` (5 keys from CLAUDE.md), `.gitignore` (`.env`, `node_modules`, `dist`).
- [ ] **1. `src/models.ts`** — Zod schemas exactly per CLAUDE.md: `AttackAttempt`, `AttackResult`, `VulnerabilityReport` + `z.infer` types. Single source of truth for all structured data.
- [ ] **2. `src/taxonomy.ts`** — the 5 techniques as a data array (`id`, `name`, `description`, seed `payload`/`goal`). Kept as data so the planner can select later and the set can grow.
- [ ] **3. `src/model.ts`** — single model factory (one place to swap providers; reads provider/model from env). Honors the "every model call goes through one factory" convention.
- [ ] **4. `src/targets.ts`** — one deliberately weak target agent: an LLM with a naive system prompt holding a fake secret and over-trusting user input. Exposes `target.invoke(prompt) → string`.
- [ ] **5. `src/judge.ts`** — pure function using `model.withStructuredOutput(AttackResult)`. Given technique + payload + target response → scored verdict (`succeeded`, `severity`, `evidence`). Never parses free text.
- [ ] **6. `src/attacker.ts`** — crafts one `AttackAttempt` for a technique, fires it at the target, hands the response to the judge. Split out of `run.ts` so Phase 2 graph nodes can reuse it.
- [ ] **7. `src/run.ts`** — CLI entrypoint: parse `--technique <id>`, run attacker → judge, pretty-print the `AttackResult`. LangSmith tracing auto-on via env.

### Deviations from CLAUDE.md structure
- Adding `src/model.ts` (a model factory) and `src/attacker.ts` (attacker logic), which aren't in CLAUDE.md's listed tree. Justification: the conventions explicitly require a single model factory, and keeping the attacker pure/separate sets up Phase 2's graph nodes cleanly.

### Attack taxonomy (5 to start)
1. Direct prompt injection ("ignore previous instructions…")
2. Indirect injection (malicious instructions hidden in retrieved/tool content)
3. Jailbreak / role-play to bypass guardrails
4. System-prompt / secret extraction
5. Tool-abuse (coax a destructive / out-of-scope tool call)

---

## Phase 2 — LangGraph.js (autonomy + scale)

**Goal:** a full red-team run; one command runs all techniques in parallel → `VulnerabilityReport`.

- [ ] `StateGraph` + `Annotation.Root` state: `targetConfig`, `attacks`, `results`, `report`.
- [ ] Concat reducer on `results` so parallel attacker nodes append.
- [ ] Planner node → `Send` fan-out to attacker nodes → judge → reporter.
- [ ] Conditional edge to flag/escalate critical hits.
- [ ] `MemorySaver` checkpointer (swap to SQLite/Postgres for durable runs).

**Done when:** one command runs all techniques in parallel and emits a `VulnerabilityReport`.

---

## Phase 3 — LangSmith (proof it works)

**Goal:** a real detection-accuracy metric, before/after.

- [ ] `evals/dataset.ts` — labeled scenarios: planted vulnerabilities + safe controls.
- [ ] `evals/evaluate.ts` — LangSmith `evaluate()` harness; LLM-as-judge scoring RedCell's accuracy.
- [ ] Trace every run; iterate prompts/strategies; record improvement (e.g. 60% → 90%).

**Done when:** README shows a before/after accuracy chart from LangSmith.

---

## Safety
RedCell is offensive tooling. Only point it at agents you own or have written permission to test.
Attack payloads stay in-repo for research use. (Mirror this in the README.)
