import type { Target } from "./targets.js";
import type { Technique } from "./taxonomy.js";
import { judge } from "./judge.js";
import { type TAttackAttempt, type TAttackResult } from "./models.js";

/**
 * One attack: craft the attempt, fire it at the target, judge the response.
 * Phase 1 uses the technique's seed payload directly (no LLM crafting yet).
 * Kept pure and small so Phase 2 graph nodes can reuse it.
 */

export interface AttackRun {
  attempt: TAttackAttempt;
  targetResponse: string;
  result: TAttackResult;
}

export function craftAttempt(technique: Technique): TAttackAttempt {
  return {
    technique: technique.id,
    payload: technique.payload,
    rationale: `Seed payload for ${technique.name}: ${technique.goal}`,
  };
}

export async function runAttack(
  technique: Technique,
  target: Target,
): Promise<AttackRun> {
  const attempt = craftAttempt(technique);
  const targetResponse = await target.invoke(attempt.payload);
  const result = await judge(technique, attempt.payload, targetResponse);
  return { attempt, targetResponse, result };
}
