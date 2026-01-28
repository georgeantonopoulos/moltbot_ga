export type PreprocessingConfig = {
  /** Enable prompt preprocessing (default: false). */
  enabled?: boolean;
  /** Model to use for preprocessing (provider/model format, e.g., "gemini/gemini-2.0-flash"). */
  model?: string;
  /** Paths to context files (.md) that define tagging rules. */
  contextFiles?: string[];
  /** Optional path to custom system prompt file. Uses built-in strict prompt if not set. */
  systemPromptPath?: string;
  /** Max tokens for preprocessor response (default: 500). */
  maxTokens?: number;
  /** Timeout in seconds (default: 30). */
  timeoutSeconds?: number;
  /** Regex patterns to exclude from preprocessing (e.g., "^/" for commands). */
  excludePatterns?: string[];
  /** Auth profile override for preprocessing model. */
  authProfile?: string;
};
