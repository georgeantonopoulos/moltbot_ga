import { z } from "zod";

export const PreprocessingSchema = z
  .object({
    enabled: z.boolean().optional(),
    model: z.string().optional(),
    contextFiles: z.array(z.string()).optional(),
    systemPromptPath: z.string().optional(),
    maxTokens: z.number().int().positive().optional(),
    timeoutSeconds: z.number().int().positive().optional(),
    excludePatterns: z.array(z.string()).optional(),
    authProfile: z.string().optional(),
  })
  .strict()
  .optional();
