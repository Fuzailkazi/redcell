/**
 * Phase 3 — the evaluator. Runs RedCell against every labeled target and scores
 * how often its verdict matches the answer key (dataset.ts).
 *
 *   pnpm tsx evals/evaluate.ts                 # all targets (≈70 OpenAI calls)
 *   pnpm tsx evals/evaluate.ts --max 3         # first 3 targets (rate-limit safe)
 *   pnpm tsx evals/evaluate.ts --target fortress
 *
 * For each (target × technique) pair we classify the outcome:
 *
 *               RedCell said SUCCEEDED?
 *                   YES         NO
 *   expected YES    TP ✅       FN ❌ (missed a real vuln)
 *   expected NO     FP ❌       TN ✅ (false alarm avoided)
 *
 * Then: accuracy, precision, recall, F1 — overall and per technique.
 * Runs SEQUENTIALLY (not parallel) so we stay under provider rate limits.
 */
import { writeFileSync } from "node:fs";
import { TAXONOMY } from "../src/taxonomy.js";
import { runAttack } from "../src/attacker.js";
import { DATASET, buildTargetFor, type EvalCase } from "./dataset.js";

try {
  process.loadEnvFile();
} catch {
  /* rely on ambient env */
}

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseArgs(argv: string[]) {
  const a = {
    target: undefined as string | undefined,
    max: Infinity,
    report: "evals/REPORT.md",
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--help" || x === "-h") a.help = true;
    else if (x === "--target") a.target = argv[++i];
    else if (x?.startsWith("--target=")) a.target = x.split("=")[1];
    else if (x === "--max") a.max = Number(argv[++i]);
    else if (x?.startsWith("--max=")) a.max = Number(x.split("=")[1]);
    else if (x === "--report") a.report = argv[++i] ?? a.report;
    else if (x?.startsWith("--report=")) a.report = x.split("=")[1] ?? a.report;
  }
  return a;
}

/** One scored (target × technique) check — collected to build the report. */
interface PairRecord {
  targetId: string;
  technique: string;
  expected: boolean;
  actual: boolean;
  severity: string;
  evidence: string;
  outcome: Outcome;
}

// ── classification ────────────────────────────────────────────────────────────
type Outcome = "TP" | "TN" | "FP" | "FN";

function classify(expected: boolean, actual: boolean): Outcome {
  if (expected && actual) return "TP";
  if (!expected && !actual) return "TN";
  if (!expected && actual) return "FP";
  return "FN";
}

const MARK: Record<Outcome, string> = { TP: "✅", TN: "✅", FP: "❌", FN: "❌" };

/** A running confusion-matrix tally. */
class Tally {
  TP = 0;
  TN = 0;
  FP = 0;
  FN = 0;
  add(o: Outcome) {
    this[o]++;
  }
  get total() {
    return this.TP + this.TN + this.FP + this.FN;
  }
  get accuracy() {
    return this.total ? (this.TP + this.TN) / this.total : 0;
  }
  get precision() {
    const d = this.TP + this.FP;
    return d ? this.TP / d : 0;
  }
  get recall() {
    const d = this.TP + this.FN;
    return d ? this.TP / d : 0;
  }
  get f1() {
    const p = this.precision,
      r = this.recall;
    return p + r ? (2 * p * r) / (p + r) : 0;
  }
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const pad = (s: string, n: number) => s.padEnd(n);

// ── one target ────────────────────────────────────────────────────────────────
async function evalTarget(
  c: EvalCase,
  idx: number,
  count: number,
  overall: Tally,
  byTechnique: Map<string, Tally>,
  records: PairRecord[],
): Promise<void> {
  const target = buildTargetFor(c);
  console.log(`\n━━━ TARGET ${idx + 1}/${count}: ${c.id} ━━━`);
  console.log(`   ${c.description}`);
  console.log(
    `   should fall for: ${c.expectedSuccesses.length ? c.expectedSuccesses.join(", ") : "(nothing — safe control)"}`,
  );

  for (const technique of TAXONOMY) {
    const expected = c.expectedSuccesses.includes(technique.id);
    const { result } = await runAttack(technique, target);
    const actual = result.succeeded;
    const outcome = classify(expected, actual);

    overall.add(outcome);
    if (!byTechnique.has(technique.id)) byTechnique.set(technique.id, new Tally());
    byTechnique.get(technique.id)!.add(outcome);
    records.push({
      targetId: c.id,
      technique: technique.id,
      expected,
      actual,
      severity: result.severity,
      evidence: result.evidence,
      outcome,
    });

    console.log(
      `   ▶ ${pad(technique.id, 20)} verdict=${actual ? "YES" : "NO "} ` +
        `(${pad(result.severity, 8)}) | expected=${expected ? "YES" : "NO "} ` +
        `→ ${outcome} ${MARK[outcome]}`,
    );
  }

  console.log(
    `   running tally: TP ${overall.TP}  TN ${overall.TN}  FP ${overall.FP}  FN ${overall.FN}` +
      `   (accuracy ${pct(overall.accuracy)})`,
  );
}

// ── final report ───────────────────────────────────────────────────────────────
function printSummary(overall: Tally, byTechnique: Map<string, Tally>): void {
  console.log("\n" + "═".repeat(64));
  console.log("EVALUATION SUMMARY");
  console.log("═".repeat(64));

  console.log("Confusion matrix:");
  console.log("                 RedCell: SUCCEEDED   RedCell: not");
  console.log(`   actually vuln   TP ${pad(String(overall.TP), 13)}   FN ${overall.FN}`);
  console.log(`   actually safe   FP ${pad(String(overall.FP), 13)}   TN ${overall.TN}`);

  console.log("─".repeat(64));
  console.log(`Accuracy   ${pct(overall.accuracy)}   (correct verdicts / all)`);
  console.log(`Precision  ${pct(overall.precision)}   (of alarms raised, how many were real)`);
  console.log(`Recall     ${pct(overall.recall)}   (of real vulns, how many were caught)`);
  console.log(`F1         ${pct(overall.f1)}   (precision/recall balance)`);

  console.log("─".repeat(64));
  console.log("Per-technique detection:");
  console.log(`   ${pad("technique", 20)} acc   recall  prec   (TP/FN/FP/TN)`);
  for (const technique of TAXONOMY) {
    const t = byTechnique.get(technique.id);
    if (!t) continue;
    console.log(
      `   ${pad(technique.id, 20)} ${pad(pct(t.accuracy), 5)} ${pad(pct(t.recall), 7)} ` +
        `${pad(pct(t.precision), 6)} (${t.TP}/${t.FN}/${t.FP}/${t.TN})`,
    );
  }
  console.log("═".repeat(64) + "\n");

  // A nudge toward Phase-3 iteration: which technique detection is weakest?
  const weakest = [...byTechnique.entries()].sort(
    (a, b) => a[1].accuracy - b[1].accuracy,
  )[0];
  if (weakest && weakest[1].accuracy < 1) {
    console.log(
      `💡 Weakest detection: ${weakest[0]} (${pct(weakest[1].accuracy)}). ` +
        `That's the technique whose attacker/judge prompt to iterate on next.\n`,
    );
  }
}

// ── markdown report ───────────────────────────────────────────────────────────
function writeReport(
  path: string,
  overall: Tally,
  byTechnique: Map<string, Tally>,
  records: PairRecord[],
  meta: { targets: number; traced: boolean; provider: string; model: string },
): void {
  const ts = new Date().toISOString();
  const lines: string[] = [];
  const p = (s = "") => lines.push(s);

  p(`# RedCell — Evaluation Report`);
  p();
  p(`_Generated: ${ts}_  ·  Provider: \`${meta.provider}\` (\`${meta.model}\`)  ·  LangSmith tracing: ${meta.traced ? "on" : "off"}`);
  p();
  p(`Detection accuracy of RedCell against ${meta.targets} labeled target(s), scored vs. a known answer key (\`evals/dataset.ts\`).`);
  p();

  p(`## Headline metrics`);
  p();
  p(`| Metric | Score | Meaning |`);
  p(`|---|---|---|`);
  p(`| **Accuracy** | **${pct(overall.accuracy)}** | correct verdicts / all checks |`);
  p(`| Precision | ${pct(overall.precision)} | of alarms raised, how many were real |`);
  p(`| Recall | ${pct(overall.recall)} | of real vulns, how many were caught |`);
  p(`| F1 | ${pct(overall.f1)} | precision/recall balance |`);
  p();

  p(`## Confusion matrix`);
  p();
  p(`| | RedCell: succeeded | RedCell: not |`);
  p(`|---|---|---|`);
  p(`| **actually vulnerable** | ${overall.TP} (TP ✅) | ${overall.FN} (FN ❌ missed) |`);
  p(`| **actually safe** | ${overall.FP} (FP ❌ false alarm) | ${overall.TN} (TN ✅) |`);
  p();

  p(`## Per-technique detection`);
  p();
  p(`| Technique | Accuracy | Recall | Precision | TP/FN/FP/TN |`);
  p(`|---|---|---|---|---|`);
  for (const technique of TAXONOMY) {
    const t = byTechnique.get(technique.id);
    if (!t) continue;
    p(`| \`${technique.id}\` | ${pct(t.accuracy)} | ${pct(t.recall)} | ${pct(t.precision)} | ${t.TP}/${t.FN}/${t.FP}/${t.TN} |`);
  }
  p();

  p(`## Per-target detail`);
  p();
  const byTarget = new Map<string, PairRecord[]>();
  for (const r of records) {
    if (!byTarget.has(r.targetId)) byTarget.set(r.targetId, []);
    byTarget.get(r.targetId)!.push(r);
  }
  for (const [targetId, recs] of byTarget) {
    p(`### \`${targetId}\``);
    p();
    p(`| Technique | Expected | RedCell verdict | Severity | Outcome |`);
    p(`|---|---|---|---|---|`);
    for (const r of recs) {
      p(
        `| \`${r.technique}\` | ${r.expected ? "vuln" : "safe"} | ${r.actual ? "**SUCCEEDED**" : "blocked"} | ${r.severity} | ${r.outcome} ${MARK[r.outcome]} |`,
      );
    }
    p();
  }

  writeFileSync(path, lines.join("\n"));
}

// ── main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      `RedCell — Phase 3 evaluator\n\n` +
        `  pnpm tsx evals/evaluate.ts [--target <id>] [--max <n>]\n\n` +
        `Targets:\n${DATASET.map((c) => `  ${pad(c.id, 20)} ${c.description}`).join("\n")}`,
    );
    process.exit(0);
  }

  let cases = DATASET;
  if (args.target) cases = cases.filter((c) => c.id === args.target);
  if (Number.isFinite(args.max)) cases = cases.slice(0, args.max);

  if (!cases.length) {
    console.error("No matching targets. Use --help to list ids.");
    process.exit(1);
  }

  const traced = process.env.LANGSMITH_TRACING === "true";
  console.log(`\n🔬 RedCell evaluation — ${cases.length} target(s)`);
  console.log(`   techniques per target: ${TAXONOMY.length}`);
  console.log(`   approx OpenAI calls: ${cases.length * TAXONOMY.length * 2}`);
  console.log(`   LangSmith tracing: ${traced ? "on" : "off"}`);

  const overall = new Tally();
  const byTechnique = new Map<string, Tally>();
  const records: PairRecord[] = [];

  for (let i = 0; i < cases.length; i++) {
    await evalTarget(cases[i]!, i, cases.length, overall, byTechnique, records);
  }

  printSummary(overall, byTechnique);

  writeReport(args.report, overall, byTechnique, records, {
    targets: cases.length,
    traced,
    provider: process.env.MODEL_PROVIDER ?? "openai",
    model: process.env.MODEL_NAME ?? "(provider default)",
  });
  console.log(`📄 Markdown report written to ${args.report}\n`);
}

main().catch((err) => {
  console.error("\n💥 Eval failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
