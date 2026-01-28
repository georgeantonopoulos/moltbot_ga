import { describe, it, expect, vi, beforeEach } from "vitest";

import type { MoltbotConfig } from "../config/config.js";

import { runPreprocessor } from "./preprocessor.js";

vi.mock("../agents/pi-embedded-runner.js", () => ({
  runEmbeddedPiAgent: vi.fn(),
}));

vi.mock("./context-loader.js", () => ({
  loadContextFiles: vi.fn(),
}));

import { runEmbeddedPiAgent } from "../agents/pi-embedded-runner.js";
import { loadContextFiles } from "./context-loader.js";

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

describe("runPreprocessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unprocessed when disabled", async () => {
    const cfg = mockCfg({ enabled: false });

    const result = await runPreprocessor({
      prompt: "test",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(false);
    expect(result.prompt).toBe("test");
  });

  it("returns unprocessed when model not configured", async () => {
    const cfg = mockCfg({ model: undefined });

    const result = await runPreprocessor({
      prompt: "test",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(false);
    expect(result.prompt).toBe("test");
  });

  it("returns unprocessed when no context files", async () => {
    const cfg = mockCfg({ contextFiles: [] });

    const result = await runPreprocessor({
      prompt: "test",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(false);
    expect(result.reason).toBe("no_context_files");
  });

  it("returns unprocessed when excluded by pattern", async () => {
    const cfg = mockCfg({ excludePatterns: ["^/"] });

    const result = await runPreprocessor({
      prompt: "/status",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(false);
    expect(result.reason).toBe("excluded_pattern");
  });

  it("returns unprocessed when context files are empty", async () => {
    const cfg = mockCfg();
    (loadContextFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce("");

    const result = await runPreprocessor({
      prompt: "test",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(false);
    expect(result.reason).toBe("empty_context");
  });

  it("returns processed prompt with valid response", async () => {
    const cfg = mockCfg();
    (loadContextFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      "# Tagging Rules\n- reminder",
    );
    (runEmbeddedPiAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      payloads: [{ text: "[TAGS: reminder]\n\ntest message" }],
    });

    const result = await runPreprocessor({
      prompt: "test message",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(true);
    expect(result.prompt).toBe("[TAGS: reminder]\n\ntest message");
    expect(result.durationMs).toBeDefined();
  });

  it("returns invalid_response_format when response lacks [TAGS:", async () => {
    const cfg = mockCfg();
    (loadContextFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce("# Rules");
    (runEmbeddedPiAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      payloads: [{ text: "I understand you want me to tag..." }],
    });

    const result = await runPreprocessor({
      prompt: "test",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(false);
    expect(result.reason).toBe("invalid_response_format");
  });

  it("returns empty_response when model returns nothing", async () => {
    const cfg = mockCfg();
    (loadContextFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce("# Rules");
    (runEmbeddedPiAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      payloads: [],
    });

    const result = await runPreprocessor({
      prompt: "test",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(false);
    expect(result.reason).toBe("empty_response");
  });

  it("fails open on error and returns original prompt", async () => {
    const cfg = mockCfg();
    (loadContextFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce("# Rules");
    (runEmbeddedPiAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("API timeout"),
    );

    const result = await runPreprocessor({
      prompt: "test message",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(result.processed).toBe(false);
    expect(result.prompt).toBe("test message");
    expect(result.reason).toBe("error");
    expect(result.error).toBe("API timeout");
  });

  it("calls runEmbeddedPiAgent with disableTools: true", async () => {
    const cfg = mockCfg();
    (loadContextFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce("# Rules");
    (runEmbeddedPiAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      payloads: [{ text: "[TAGS: none]\n\ntest" }],
    });

    await runPreprocessor({
      prompt: "test",
      cfg,
      agentDir: "/tmp/agent",
    });

    expect(runEmbeddedPiAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        disableTools: true,
        thinkLevel: "off",
      }),
    );
  });
});
