import fs from 'fs-extra';

export interface FileConfig {
  docs?: string;
  include?: string[];
  strict?: boolean;
  cache?: boolean;
  cacheFile?: string;
  coverageOut?: string;
  coverageFormat?: string;
  slackWebhook?: string;
  discordWebhook?: string;
  fixDocs?: boolean;
  checkDescriptions?: boolean;
  updateReadme?: boolean;
  readmePath?: string;
  annotate?: boolean;
}

export const DEFAULT_CONFIG_PATH = '.doc-sync-checkrc.json';

const STRING_KEYS = [
  'docs',
  'cacheFile',
  'coverageOut',
  'coverageFormat',
  'slackWebhook',
  'discordWebhook',
  'readmePath',
] as const;

const BOOLEAN_KEYS = ['strict', 'cache', 'fixDocs', 'checkDescriptions', 'updateReadme', 'annotate'] as const;

// Keep only known fields whose type matches, so a wrong-typed value falls back
// to the default instead of crashing later (e.g. a non-string reaching path.join).
function sanitize(raw: Record<string, unknown>, configPath: string): FileConfig {
  const config: FileConfig = {};
  const warn = (key: string, expected: string): void =>
    console.warn(`⚠️  Ignoring config field '${key}' in ${configPath}: expected ${expected}`);

  for (const key of STRING_KEYS) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] === 'string') config[key] = raw[key] as string;
    else warn(key, 'string');
  }
  for (const key of BOOLEAN_KEYS) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] === 'boolean') config[key] = raw[key] as boolean;
    else warn(key, 'boolean');
  }
  if (raw.include !== undefined) {
    if (Array.isArray(raw.include) && raw.include.every((item) => typeof item === 'string')) {
      config.include = raw.include as string[];
    } else {
      warn('include', 'string array');
    }
  }
  return config;
}

export async function loadFileConfig(configPath: string = DEFAULT_CONFIG_PATH): Promise<FileConfig> {
  if (!(await fs.pathExists(configPath))) return {};
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return sanitize(parsed as Record<string, unknown>, configPath);
  } catch {
    console.warn(`⚠️  Ignoring malformed config file: ${configPath}`);
    return {};
  }
}
