import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { installHook } from '../src/installer.js';

const HOOK_CONTENT = `#!/bin/sh\nnpx doc-sync-check src --strict\n`;
const GITIGNORE_ENTRY = '.git/hooks/pre-commit.bak';

describe('installHook', () => {
  let tmpDir: string;

  // 3.1 Set up temp-dir fixture
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'installer-test-'));
    await fs.ensureDir(path.join(tmpDir, '.git', 'hooks'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  // 3.2 Happy-path: hook file created with correct content and permissions
  it('creates hook file with correct content and permissions', async () => {
    const result = await installHook({ cwd: tmpDir });

    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');

    expect(await fs.pathExists(hookPath)).toBe(true);

    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content.split('\n')[0]).toBe('#!/bin/sh');
    expect(content).toContain('--strict');

    const stat = await fs.stat(hookPath);
    expect((stat.mode & 0o777)).toBe(0o755);

    expect(result.hookPath).toBe(hookPath);
  });

  // 3.3 .git/ missing → throws "No Git repository found"
  it('throws "No Git repository found" when .git/ is absent', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'installer-nogit-'));
    try {
      await expect(installHook({ cwd: emptyDir })).rejects.toThrow('No Git repository found');
    } finally {
      await fs.remove(emptyDir);
    }
  });

  // 3.4 .git/hooks/ missing → directory is created automatically
  it('creates .git/hooks/ directory when it does not exist', async () => {
    const noHooksDir = await fs.mkdtemp(path.join(os.tmpdir(), 'installer-nohooks-'));
    await fs.ensureDir(path.join(noHooksDir, '.git'));
    try {
      await installHook({ cwd: noHooksDir });
      const hookPath = path.join(noHooksDir, '.git', 'hooks', 'pre-commit');
      expect(await fs.pathExists(hookPath)).toBe(true);
    } finally {
      await fs.remove(noHooksDir);
    }
  });

  // 3.5 Existing hook, no --force → throws "already exists", original file unchanged
  it('throws "already exists" when hook exists and force is false', async () => {
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    const originalContent = '#!/bin/sh\necho "custom hook"\n';
    await fs.writeFile(hookPath, originalContent, 'utf-8');

    await expect(installHook({ cwd: tmpDir })).rejects.toThrow('already exists');

    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).toBe(originalContent);
  });

  // 3.6 Existing hook, --force → file overwritten, result.replaced === true
  it('overwrites existing hook when force is true and sets replaced to true', async () => {
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    await fs.writeFile(hookPath, '#!/bin/sh\necho "old hook"\n', 'utf-8');

    const result = await installHook({ cwd: tmpDir, force: true });

    expect(result.replaced).toBe(true);

    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).toContain('--strict');
    expect(content.split('\n')[0]).toBe('#!/bin/sh');
  });

  // 3.7 .gitignore absent → created with the entry
  it('creates .gitignore with the entry when it does not exist', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    await fs.remove(gitignorePath);

    await installHook({ cwd: tmpDir });

    expect(await fs.pathExists(gitignorePath)).toBe(true);
    const content = await fs.readFile(gitignorePath, 'utf-8');
    expect(content).toContain(GITIGNORE_ENTRY);
  });

  // 3.8 .gitignore present without entry → entry appended, result.gitignoreUpdated === true
  it('appends entry to existing .gitignore and returns gitignoreUpdated true', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    await fs.writeFile(gitignorePath, 'node_modules\ndist\n', 'utf-8');

    const result = await installHook({ cwd: tmpDir });

    expect(result.gitignoreUpdated).toBe(true);
    const content = await fs.readFile(gitignorePath, 'utf-8');
    expect(content).toContain(GITIGNORE_ENTRY);
  });

  // 3.9 .gitignore present with entry → file unchanged, result.gitignoreUpdated === false
  it('leaves .gitignore unchanged and returns gitignoreUpdated false when entry already present', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    const originalContent = `node_modules\n# doc-sync-check\n${GITIGNORE_ENTRY}\n`;
    await fs.writeFile(gitignorePath, originalContent, 'utf-8');

    const result = await installHook({ cwd: tmpDir });

    expect(result.gitignoreUpdated).toBe(false);
    const content = await fs.readFile(gitignorePath, 'utf-8');
    expect(content).toBe(originalContent);
  });
});
