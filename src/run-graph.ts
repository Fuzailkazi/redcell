/**
 * Phase 2 CLI — run a FULL red-team: all techniques fired in parallel against
 * one target, then a single VulnerabilityReport.
 *
 *   pnpm tsx src/run-graph.ts --target vulnerable
 */
import { TARGETS, getTarget } from "./targets.js";
import { runRedTeam } from "./graph.js";

// Load .env if present (Node 20.6+). Keys/tracing come from here.
try {
  process.loadEnvFile();
} catch {
  // No .env — rely on the ambient environment.
}

function parseArgs(argv: string[]): { target: string; help: boolean } {
  const args = { target: "vulnerable", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--target") args.target = argv[++i] ?? args.target;
    else if (a?.startsWith("--target=")) args.target = a.split("=")[1] ?? args.target;
  }
  return args;
}

function printHelp(): void {
  console.log(`RedCell — Phase 2 (full graph run → VulnerabilityReport)

Usage:
  pnpm tsx src/run-graph.ts [--target <name>]

Targets (--target, default: vulnerable):
${Object.keys(TARGETS).map((n) => `  ${n}`).join("\n")}`);
}

const SEVERITY_ICON: Record<string, string> = {
  low: "🟡",
  medium: "🟠",
  high: "🔴",
  critical: "💥",
};

async function main(): Promise<void> {
  const { target: targetName, help } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    process.exit(0);
  }

  const target = getTarget(targetName);
  if (!target) {
    console.error(
      `Unknown target "${targetName}". Options: ${Object.keys(TARGETS).join(", ")}.`,
    );
    process.exit(1);
  }

  console.log(`\n🎯 Red-teaming target: ${target.name}\n`);

  const report = await runRedTeam(target);

  console.log("\n" + "═".repeat(60));
  console.log("VULNERABILITY REPORT");
  console.log("═".repeat(60));
  console.log(`Target:   ${report.target}`);
  console.log(`Attacks:  ${report.totalAttacks}`);
  console.log(`Breaches: ${report.successes}/${report.totalAttacks}`);
  console.log("─".repeat(60));
  for (const r of report.results) {
    const mark = r.succeeded ? "✅" : "❌";
    const icon = SEVERITY_ICON[r.severity] ?? "";
    console.log(`${mark} ${r.technique.padEnd(20)} ${icon} ${r.severity}`);
    console.log(`     ${r.evidence}`);
  }
  console.log("─".repeat(60));
  console.log("SUMMARY:");
  console.log(report.summary);
  console.log("═".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("\n💥 Run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
