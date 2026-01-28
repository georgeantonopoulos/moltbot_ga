import type { MoltbotConfig } from "../config/config.js";
import type { MsgContext } from "../auto-reply/templating.js";
import { finalizeInboundContext } from "../auto-reply/reply/inbound-context.js";

import { runPreprocessor } from "./preprocessor.js";

export type ApplyPreprocessingResult = {
  applied: boolean;
  reason?: string;
  durationMs?: number;
};

/**
 * Apply preprocessing to the message context.
 * Updates ctx.BodyForAgent with the tagged prompt if preprocessing succeeds.
 * Fails open - original message passes through on any error.
 */
export async function applyPreprocessing(params: {
  ctx: MsgContext;
  cfg: MoltbotConfig;
  agentDir: string;
  sessionId?: string;
}): Promise<ApplyPreprocessingResult> {
  const { ctx, cfg, agentDir, sessionId } = params;
  const config = cfg.preprocessing;

  // Quick bail if not enabled
  if (!config?.enabled) {
    return { applied: false, reason: "disabled" };
  }

  // Get the body to preprocess
  const body = ctx.BodyForAgent ?? ctx.Body;
  if (!body?.trim()) {
    return { applied: false, reason: "empty_body" };
  }

  // Skip commands (starting with /)
  if (body.trim().startsWith("/")) {
    return { applied: false, reason: "command" };
  }

  // Run preprocessor
  const result = await runPreprocessor({
    prompt: body,
    cfg,
    agentDir,
    sessionId,
  });

  if (!result.processed) {
    return {
      applied: false,
      reason: result.reason,
      durationMs: result.durationMs,
    };
  }

  // Update context with preprocessed body
  ctx.BodyForAgent = result.prompt;

  // Re-finalize context with the updated body
  finalizeInboundContext(ctx, { forceBodyForAgent: true });

  return {
    applied: true,
    durationMs: result.durationMs,
  };
}
