import * as fc from 'fast-check';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { installHook } from '../src/installer.js';

// Feature: git-hook-install, Property 1: .gitignore entry is always present after install
// Validates: Requirements 5.2, 5.3
describe('Property 1: .gitignore entry is always present after install', () => {
  it('always contains .git/hooks/pre-commit.bak after installHook regardless of prior content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !s.includes('.git/hooks/pre-commit.bak')),
        async (existingContent) => {
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prop1-'));
          try {
            await fs.ensureDir(path.join(tmpDir, '.git', 'hooks'));
            await fs.writeFile(path.join(tmpDir, '.gitignore'), existingContent, 'utf-8');
            await installHook({ cwd: tmpDir });
            const result = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
            return result.includes('.git/hooks/pre-commit.bak');
          } finally {
            await fs.remove(tmpDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: git-hook-install, Property 2: .gitignore entries are never duplicated
// Validates: Requirements 5.4
describe('Property 2: .gitignore entries are never duplicated', () => {
  it('entry appears exactly once even when already present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        async (surroundingContent) => {
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prop2-'));
          try {
            await fs.ensureDir(path.join(tmpDir, '.git', 'hooks'));
            const entry = '.git/hooks/pre-commit.bak';
            const content = `${surroundingContent}\n${entry}\n${surroundingContent}`;
            await fs.writeFile(path.join(tmpDir, '.gitignore'), content, 'utf-8');
            await installHook({ cwd: tmpDir });
            const result = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
            const count = result.split(entry).length - 1;
            return count === 1;
          } finally {
            await fs.remove(tmpDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
