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

  it('drops fields whose type does not match the schema', async () => {
    const configPath = path.join(tempDir, 'rc.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({ docs: 123, strict: 'yes', include: ['ok.md', 5], readmePath: './R.md' }),
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await loadFileConfig(configPath);
    expect(result).toEqual({ readmePath: './R.md' });
    warn.mockRestore();
  });

  it('keeps a numeric minCoverage and drops a non-numeric one', async () => {
    const goodPath = path.join(tempDir, 'good.json');
    await fs.writeFile(goodPath, JSON.stringify({ minCoverage: 90 }));
    expect(await loadFileConfig(goodPath)).toEqual({ minCoverage: 90 });

    const badPath = path.join(tempDir, 'bad-num.json');
    await fs.writeFile(badPath, JSON.stringify({ minCoverage: '90' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadFileConfig(badPath)).toEqual({});
    warn.mockRestore();
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
