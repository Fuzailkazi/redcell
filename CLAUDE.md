# RedCell — an AI agent that red-teams other AI agents

> Autonomous adversarial testing for LLM agents. RedCell launches prompt-injection, jailbreak,
> and tool-abuse attacks against a target agent, then produces a graded vulnerability report.
>
> **Stack: TypeScript** (LangChain.js · LangGraph.js · LangSmith).

This file orients any AI coding assistant (Claude Code, Cursor) working in this repo. Read it fully before writing code.

---

## Mission

Agents that can call tools are an attack surface. RedCell is the automated attacker: point it at a
target agent/LLM, and it systematically tries known attack techniques, judges whether each one
succeeded, and reports the findings with severity scores. Think "Burp Suite / Metasploit, but for
AI agents."

This is simultaneously:
- a **learning project** (covers LangChain + LangGraph + LangSmith end to end, in TS),
- a **portfolio centerpiece** (security domain + full stack + measured results), and
- a possible **company seed** (AI-agent security is an open category).

## Tech stack

- **Node.js 20+** and **TypeScript 5+** (strict mode)
- **LangChain.js** — `langchain`, `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`
- **LangGraph.js** — `@langchain/langgraph` (the planner → attackers → judge graph, parallel fan-out, durability)
- **LangSmith** — `langsmith` JS SDK (tracing every run + evaluating RedCell's own accuracy)
- **Zod** — all structured data/schemas (the TS equivalent of Pydantic)
- **tsx** to run, **vitest** to test, **pnpm** (or npm) for deps

## Architecture (the graph)

```
            ┌─────────────┐
   target → │   PLANNER   │  picks N attack strategies from the taxonomy
            └──────┬──────┘
                   │ Send (fan-out, parallel)
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   ┌────────┐ ┌────────┐ ┌────────┐
   │ATTACKER│ │ATTACKER│ │ATTACKER│   each crafts + fires one attack at the target
   └───┬────┘ └───┬────┘ └───┬────┘
       └──────────┼──────────┘
                  ▼
            ┌─────────────┐
            │    JUDGE    │  scores each result: succeeded? severity? evidence?
            └──────┬──────┘
                   ▼
            ┌─────────────┐
            │  REPORTER   │  aggregates → VulnerabilityReport (structured)
            └─────────────┘
```

Define graph state with LangGraph's `Annotation.Root({...})`. Carry: `targetConfig`, `attacks`,
`results`, `report`. Use a reducer (e.g. concat) for the `results` array so parallel attacker nodes
append instead of overwrite. Checkpoint with `MemorySaver` (swap to a SQLite/Postgres saver for
durable runs).

## Core data models (Zod — define these first, in `src/models.ts`)

```ts
import { z } from "zod";

export const AttackAttempt = z.object({
  technique: z.string(),
  payload: z.string(),
  rationale: z.string(),
});

export const AttackResult = z.object({
  technique: z.string(),
  succeeded: z.boolean(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  evidence: z.string(),
});

export const VulnerabilityReport = z.object({
  target: z.string(),
  totalAttacks: z.number(),
  successes: z.number(),
  results: z.array(AttackResult),
  summary: z.string(),
});

export type TAttackResult = z.infer<typeof AttackResult>;
```

Always use `model.withStructuredOutput(AttackResult)` for the judge and reporter — never parse free text.

## Attack taxonomy (start with ~5, grow later) — `src/taxonomy.ts`

1. Direct prompt injection ("ignore previous instructions…")
2. Indirect injection (malicious instructions hidden in retrieved/tool content)
3. Jailbreak / role-play to bypass guardrails
4. System-prompt / secret extraction
5. Tool-abuse (coax the agent into a destructive or out-of-scope tool call)

Keep techniques as data (an array of strategy objects) so the planner can select and the set can expand.

## Repo structure

```
redcell/
  CLAUDE.md              # this file
  README.md              # portfolio-facing: problem, approach, results
  package.json
  tsconfig.json          # strict: true
  .env.example           # API keys + LangSmith config (never commit .env)
  src/
    models.ts            # Zod schemas
    taxonomy.ts          # attack techniques as data
    targets.ts           # adapters for the agent/LLM under test
    graph.ts             # LangGraph: planner, attacker, judge, reporter nodes + wiring
    judge.ts             # structured-output scoring logic
    run.ts               # CLI entrypoint
  evals/
    dataset.ts           # labeled scenarios (planted vulnerabilities + safe cases)
    evaluate.ts          # LangSmith evaluate() harness for RedCell's accuracy
  tests/
```

## Build roadmap — ship in thin slices, one phase per tool

**Phase 1 — LangChain.js (the attacker brain).** Goal: one attack → one verdict.
- Define the Zod models and 5 techniques.
- One target adapter (a deliberately weak LLM agent you control).
- One attacker function + a judge using `withStructuredOutput(AttackResult)`.
- DONE WHEN: `pnpm tsx src/run.ts --technique direct_injection` prints a scored `AttackResult`.

**Phase 2 — LangGraph.js (autonomy + scale).** Goal: a full red-team run.
- Build the graph with `StateGraph` + `Annotation.Root`: planner → `Send` fan-out to attackers → judge → reporter.
- Conditional edge to flag/escalate critical hits; add a `MemorySaver` checkpointer.
- DONE WHEN: one command runs all techniques in parallel and emits a `VulnerabilityReport`.

**Phase 3 — LangSmith (proof it works).** Goal: a real metric.
- Build a labeled dataset: targets with *known* planted vulnerabilities + safe controls.
- Trace every run; write an evaluator (LLM-as-judge) scoring RedCell's detection accuracy.
- Iterate prompts/strategies and record the improvement (e.g. 60% → 90% detection).
- DONE WHEN: the README shows a before/after accuracy chart from LangSmith.

## Conventions

- TypeScript **strict** mode; `zod` for all structured data; infer types from schemas (`z.infer`).
- Keep nodes small and pure; the graph wiring lives only in `graph.ts`.
- Every model call goes through a single factory (e.g. `initChatModel` from `langchain/chat_models/universal`, or wrap `ChatOpenAI`/`ChatAnthropic`) so providers are swappable.
- Set `LANGSMITH_TRACING=true` in dev so every run is traced from day one.
- ESM modules (`"type": "module"` in package.json). Vitest for tests — especially the judge logic.

## Setup

```bash
cp .env.example .env        # add OPENAI_API_KEY / ANTHROPIC_API_KEY, LANGSMITH_API_KEY
pnpm install                # or: npm install
pnpm tsx src/run.ts --help
```

`.env.example` keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LANGSMITH_API_KEY`,
`LANGSMITH_TRACING=true`, `LANGSMITH_PROJECT=redcell`.

Suggested deps:
```
pnpm add langchain @langchain/core @langchain/openai @langchain/anthropic @langchain/langgraph langsmith zod
pnpm add -D typescript tsx vitest @types/node
```

## ⚠️ Safety & ethics (read before running)

RedCell is an **offensive** tool. Only ever point it at agents/systems **you own or have explicit
written permission to test.** Attack payloads stay in this repo for research use. Do not use against
third-party or production systems without authorization. This framing belongs in the README too —
responsible-disclosure posture is itself a credibility signal for a security portfolio.

## Portfolio framing (for the README)

Lead with the problem (agents are an attack surface), show the autonomous system, and end with the
**measured result** from Phase 3. Numbers + security domain + full-stack agent engineering is the
combination that signals "AI product leader," not "tutorial follower."
