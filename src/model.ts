import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/**
 * Single model factory — every model call in RedCell goes through here so
 * providers stay swappable (CLAUDE.md convention). Provider/model are read from
 * env: MODEL_PROVIDER ("anthropic" | "openai") and optional MODEL_NAME.
 */

const DEFAULTS = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
} as const;

type Provider = keyof typeof DEFAULTS;

export interface ModelOptions {
  /** Sampling temperature. Default 0 for deterministic judging. */
  temperature?: number;
}

export function createModel(opts: ModelOptions = {}): BaseChatModel {
  const provider = (process.env.MODEL_PROVIDER ?? "openai") as Provider;
  const temperature = opts.temperature ?? 0;
  const model = process.env.MODEL_NAME ?? DEFAULTS[provider];

  switch (provider) {
    case "anthropic":
      return new ChatAnthropic({ model, temperature });
    case "openai":
      return new ChatOpenAI({ model, temperature });
    default:
      throw new Error(
        `Unknown MODEL_PROVIDER "${provider}". Use "anthropic" or "openai".`,
      );
  }
}
