import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFileConfig } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('loadFileConfig', () => {
  const tempDir = path.join(__dirname, 'temp_config');

  beforeEach(async () => {
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('returns an empty object when the config file is absent', async () => {
    const result = await loadFileConfig(path.join(tempDir, 'missing.json'));
    expect(result).toEqual({});
  });

  it('parses a valid config file', async () => {
    const configPath = path.join(tempDir, 'rc.json');
    await fs.writeFile(configPath, JSON.stringify({ strict: true, include: ['docs/**/*.md'] }));
    const result = await loadFileConfig(configPath);
    expect(result).toEqual({ strict: true, include: ['docs/**/*.md'] });
  });

  it('ignores a malformed config file instead of throwing', async () => {
    const configPath = path.join(tempDir, 'bad.json');
    await fs.writeFile(configPath, '{ not valid json ');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await loadFileConfig(configPath);
    expect(result).toEqual({});
    warn.mockRestore();
  });
});
