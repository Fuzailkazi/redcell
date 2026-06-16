/**
 * CLI entrypoint for Phase 1: fire ONE technique at the weak target and print
 * a scored AttackResult.
 *
 *   pnpm tsx src/run.ts --technique direct_injection
 */
import { TAXONOMY, getTechnique } from "./taxonomy.js";
import { weakTarget } from "./targets.js";
import { runAttack } from "./attacker.js";

// Load .env if present (Node 20.6+). Tracing/keys come from here.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the ambient environment.
}

function parseArgs(argv: string[]): { technique?: string; help: boolean } {
  const args = { technique: undefined as string | undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--technique" || a === "-t") args.technique = argv[++i];
    else if (a?.startsWith("--technique=")) args.technique = a.split("=")[1];
  }
  return args;
}

function printHelp(): void {
  console.log(`RedCell — Phase 1 (single attack → scored verdict)

Usage:
  pnpm tsx src/run.ts --technique <id>

Techniques:
${TAXONOMY.map((t) => `  ${t.id.padEnd(20)} ${t.name}`).join("\n")}

Env (via .env or shell):
  OPENAI_API_KEY      required (default provider)
  MODEL_PROVIDER      openai | anthropic   (default: openai)
  LANGSMITH_TRACING   true to trace runs    (optional)`);
}

const SEVERITY_ICON: Record<string, string> = {
  low: "🟡",
  medium: "🟠",
  high: "🔴",
  critical: "💥",
};

async function main(): Promise<void> {
  const { technique: id, help } = parseArgs(process.argv.slice(2));

  if (help || !id) {
    printHelp();
    process.exit(help ? 0 : 1);
  }

  const technique = getTechnique(id);
  if (!technique) {
    console.error(`Unknown technique "${id}". Run with --help to list them.`);
    process.exit(1);
  }

  const traced = process.env.LANGSMITH_TRACING === "true";
  const target = weakTarget();

  console.log(`\n🎯 Target:    ${target.name}`);
  console.log(`🧪 Technique: ${technique.name} (${technique.id})`);
  console.log(`📡 Tracing:   ${traced ? "on (LangSmith)" : "off"}\n`);

  const { targetResponse, result } = await runAttack(technique, target);

  console.log("─".repeat(60));
  console.log("TARGET RESPONSE:");
  console.log(targetResponse.trim());
  console.log("─".repeat(60));
  console.log("VERDICT (AttackResult):");
  console.log(`  technique: ${result.technique}`);
  console.log(`  succeeded: ${result.succeeded ? "✅ YES" : "❌ no"}`);
  console.log(`  severity:  ${SEVERITY_ICON[result.severity] ?? ""} ${result.severity}`);
  console.log(`  evidence:  ${result.evidence}`);
  console.log("─".repeat(60));
  console.log("\nRaw JSON:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("\n💥 Run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
