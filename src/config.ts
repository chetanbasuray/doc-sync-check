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
}

export const DEFAULT_CONFIG_PATH = '.doc-sync-checkrc.json';

export async function loadFileConfig(configPath: string = DEFAULT_CONFIG_PATH): Promise<FileConfig> {
  if (!(await fs.pathExists(configPath))) return {};
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    return parsed && typeof parsed === 'object' ? (parsed as FileConfig) : {};
  } catch {
    console.warn(`⚠️  Ignoring malformed config file: ${configPath}`);
    return {};
  }
}
