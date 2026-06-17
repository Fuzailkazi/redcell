import { z } from "zod";

/** A single crafted attack: what we send and why. */
export const AttackAttempt = z.object({
  technique: z.string(),
  payload: z.string(),
  rationale: z.string(),
});
export type TAttackAttempt = z.infer<typeof AttackAttempt>;

/** The judge's verdict on one attack. Always produced via withStructuredOutput. */
export const AttackResult = z.object({
  technique: z.string(),
  succeeded: z.boolean(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  evidence: z.string(),
});
export type TAttackResult = z.infer<typeof AttackResult>;

/**
 * The reporter's LLM-generated prose. We compute the counts/results
 * deterministically and only ask the model for the narrative summary —
 * via withStructuredOutput, so we never parse free text (CLAUDE.md rule).
 */
export const ReportSummary = z.object({
  summary: z.string(),
});
export type TReportSummary = z.infer<typeof ReportSummary>;

/** Aggregated findings across a full red-team run (Phase 2+). */
export const VulnerabilityReport = z.object({
  target: z.string(),
  totalAttacks: z.number(),
  successes: z.number(),
  results: z.array(AttackResult),
  summary: z.string(),
});
export type TVulnerabilityReport = z.infer<typeof VulnerabilityReport>;
