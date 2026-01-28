import { describe, it, expect, vi, beforeEach } from "vitest";

import type { MoltbotConfig } from "../config/config.js";
import type { MsgContext } from "../auto-reply/templating.js";

import { applyPreprocessing } from "./apply.js";

vi.mock("./preprocessor.js", () => ({
  runPreprocessor: vi.fn(),
}));

vi.mock("../auto-reply/reply/inbound-context.js", () => ({
  finalizeInboundContext: vi.fn(),
}));

import { runPreprocessor } from "./preprocessor.js";

function mockCtx(overrides: Partial<MsgContext> = {}): MsgContext {
  return {
    Body: "test message",
    BodyForAgent: "test message",
    ...overrides,
  } as MsgContext;
}

function mockCfg(overrides: Partial<MoltbotConfig["preprocessing"]> = {}): MoltbotConfig {
  return {
    preprocessing: {
      enabled: true,
      model: "gemini/gemini-2.0-flash",
      contextFiles: ["~/context.md"],
      ...overrides,
    },
  } as MoltbotConfig;
}

describe("applyPreprocessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disabled when preprocessing not enabled", async () => {
    const ctx = mockCtx();
    const cfg = mockCfg({ enabled: false });

    const result = await applyPreprocessing({
      ctx,
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(runPreprocessor).not.toHaveBeenCalled();
  });

  it("returns disabled when preprocessing config is missing", async () => {
    const ctx = mockCtx();
    const cfg = {} as MoltbotConfig;

    const result = await applyPreprocessing({
      ctx,
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("returns empty_body when body is empty", async () => {
    const ctx = mockCtx({ Body: "", BodyForAgent: "" });
    const cfg = mockCfg();

    const result = await applyPreprocessing({
      ctx,
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("empty_body");
  });

  it("skips command messages starting with /", async () => {
    const ctx = mockCtx({ Body: "/status", BodyForAgent: "/status" });
    const cfg = mockCfg();

    const result = await applyPreprocessing({
      ctx,
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("command");
    expect(runPreprocessor).not.toHaveBeenCalled();
  });

  it("updates ctx.BodyForAgent when preprocessing succeeds", async () => {
    const ctx = mockCtx({ Body: "remind me to call mom" });
    const cfg = mockCfg();

    (runPreprocessor as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      processed: true,
      prompt: "[TAGS: reminder, family]\n\nremind me to call mom",
      durationMs: 100,
    });

    const result = await applyPreprocessing({
      ctx,
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.applied).toBe(true);
    expect(result.durationMs).toBe(100);
    expect(ctx.BodyForAgent).toBe("[TAGS: reminder, family]\n\nremind me to call mom");
  });

  it("returns reason when preprocessing fails", async () => {
    const ctx = mockCtx({ Body: "test message" });
    const cfg = mockCfg();

    (runPreprocessor as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      processed: false,
      prompt: "test message",
      reason: "no_context_files",
    });

    const result = await applyPreprocessing({
      ctx,
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("no_context_files");
  });

  it("uses BodyForAgent if available", async () => {
    const ctx = mockCtx({
      Body: "original body",
      BodyForAgent: "body for agent with media context",
    });
    const cfg = mockCfg();

    (runPreprocessor as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      processed: true,
      prompt: "[TAGS: media]\n\nbody for agent with media context",
      durationMs: 50,
    });

    await applyPreprocessing({
      ctx,
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(runPreprocessor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "body for agent with media context",
      }),
    );
  });
});
