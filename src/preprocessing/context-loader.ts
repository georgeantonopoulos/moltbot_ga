import fs from "node:fs/promises";
import path from "node:path";

import { resolveUserPath } from "../utils.js";

export type LoadedContext = {
  path: string;
  content: string;
  loadedAt: number;
};

// Cache context files for 60 seconds to avoid re-reading on every message
const CACHE_TTL_MS = 60_000;
const contextCache = new Map<string, LoadedContext>();

/**
 * Load context files from disk with caching.
 * Returns concatenated content with file separators.
 * Skips missing files silently (doesn't fail).
 */
export async function loadContextFiles(paths: string[]): Promise<string> {
  const results: string[] = [];
  const now = Date.now();

  for (const filePath of paths) {
    const resolved = resolveUserPath(filePath);
    const cached = contextCache.get(resolved);

    if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
      results.push(`--- ${path.basename(resolved)} ---\n${cached.content}`);
      continue;
    }

    try {
      const content = await fs.readFile(resolved, "utf-8");
      contextCache.set(resolved, { path: resolved, content, loadedAt: now });
      results.push(`--- ${path.basename(resolved)} ---\n${content}`);
    } catch {
      // Skip missing files silently - continue with other files
    }
  }

  return results.join("\n\n");
}

/**
 * Clear the context cache (useful for testing or when files are updated).
 */
export function clearContextCache(): void {
  contextCache.clear();
}
