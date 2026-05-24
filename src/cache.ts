import fs from 'fs-extra';
import path from 'path';
import { createHash } from 'crypto';
import type { FunctionSignature } from './extractor.js';

export interface CacheEntry {
  mtimeMs: number;
  hash: string;
  signatures: FunctionSignature[];
}

export interface DriftCache {
  version: 1;
  files: Record<string, CacheEntry>;
}

export const DEFAULT_CACHE_PATH = '.doc-sync-cache.json';

export async function loadCache(cachePath: string): Promise<DriftCache> {
  if (!(await fs.pathExists(cachePath))) {
    return { version: 1, files: {} };
  }
  const raw = await fs.readFile(cachePath, 'utf-8');
  try {
    const parsed = JSON.parse(raw) as DriftCache;
    return parsed.version === 1 ? parsed : { version: 1, files: {} };
  } catch {
    return { version: 1, files: {} };
  }
}

export async function saveCache(cachePath: string, cache: DriftCache): Promise<void> {
  await fs.ensureDir(path.dirname(cachePath) || '.');
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export const contentHash = (content: string): string => createHash('sha1').update(content).digest('hex');
