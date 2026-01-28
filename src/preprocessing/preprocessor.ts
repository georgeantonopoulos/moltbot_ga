import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { MoltbotConfig } from "../config/config.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded-runner.js";
import { resolveModelRefFromString } from "../agents/model-selection.js";
import { resolveUserPath } from "../utils.js";

import { loadContextFiles } from "./context-loader.js";
import { DEFAULT_PREPROCESSING_SYSTEM_PROMPT } from "./default-prompt.js";

const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TIMEOUT_SECONDS = 30;

export type PreprocessingResult = {
  processed: boolean;
  prompt: string;
  reason?: string;
  error?: string;
  durationMs?: number;
};

/**
 * Run the preprocessing model to tag a prompt.
 * Returns the tagged prompt or original if preprocessing fails/skips.
 */
export async function runPreprocessor(params: {
  prompt: string;
  cfg: MoltbotConfig;
  agentDir: string;
  sessionId?: string;
}): Promise<PreprocessingResult> {
  const { prompt, cfg, agentDir } = params;
  const config = cfg.preprocessing;

  if (!config?.enabled || !config.model) {
    return { processed: false, prompt };
  }

  // Check exclude patterns
  if (config.excludePatterns?.length) {
    for (const pattern of config.excludePatterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(prompt)) {
          return { processed: false, prompt, reason: "excluded_pattern" };
        }
      } catch {
        // Invalid regex - skip this pattern
      }
    }
  }

  // Skip if no context files configured
  if (!config.contextFiles?.length) {
    return { processed: false, prompt, reason: "no_context_files" };
  }

  const startedAt = Date.now();
  let tmpDir: string | undefined;

  try {
    // Load context files
    const contextContent = await loadContextFiles(config.contextFiles);
    if (!contextContent.trim()) {
      return { processed: false, prompt, reason: "empty_context" };
    }

    // Load system prompt (custom or default)
    let systemPrompt = DEFAULT_PREPROCESSING_SYSTEM_PROMPT;
    if (config.systemPromptPath) {
      try {
        const resolved = resolveUserPath(config.systemPromptPath);
        systemPrompt = await fs.readFile(resolved, "utf-8");
      } catch {
        // Fall back to default - silently use built-in prompt
      }
    }

    // Resolve model (no alias support for preprocessing - use full provider/model format)
    const modelRef = resolveModelRefFromString({
      raw: config.model,
      defaultProvider: "google",
    });
    if (!modelRef) {
      return { processed: false, prompt, reason: "invalid_model" };
    }

    // Build the preprocessing prompt
    const fullPrompt = `<context_files>
${contextContent}
</context_files>

<user_message>
${prompt}
</user_message>

Tag this message according to the context files. Return ONLY the tagged message.`;

    // Create temp directory for session file
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-preprocessing-"));
    const sessionFile = path.join(tmpDir, "session.json");
    const sessionId = `preprocess-${params.sessionId ?? Date.now()}`;

    // Run the preprocessor model
    const result = await runEmbeddedPiAgent({
      sessionId,
      sessionFile,
      workspaceDir: process.cwd(),
      agentDir,
      config: cfg,
      prompt: fullPrompt,
      extraSystemPrompt: systemPrompt,
      provider: modelRef.ref.provider,
      model: modelRef.ref.model,
      authProfileId: config.authProfile,
      disableTools: true,
      thinkLevel: "off",
      timeoutMs: (config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
      runId: `preprocess-${Date.now()}`,
      streamParams: {
        maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
    });

    // Extract result text from payloads
    const payloads = (result as { payloads?: Array<{ text?: string }> }).payloads ?? [];
    const responseText = payloads
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();

    // DEBUG

    if (!responseText) {
      return {
        processed: false,
        prompt,
        reason: "empty_response",
        durationMs: Date.now() - startedAt,
      };
    }

    // Validate response format - must start with [TAGS:
    if (!responseText.startsWith("[TAGS:")) {
      // Model didn't follow format - fail open
      return {
        processed: false,
        prompt,
        reason: "invalid_response_format",
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      processed: true,
      prompt: responseText,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    // Fail open - return original prompt
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      processed: false,
      prompt,
      reason: "error",
      error: errorMsg,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    // Cleanup temp directory
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
