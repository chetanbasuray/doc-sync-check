import fs from 'fs-extra';
import path from 'path';

export interface InstallHookOptions {
  /** Working directory to resolve .git/ from. Defaults to process.cwd(). */
  cwd?: string;
  /** Overwrite an existing pre-commit hook without prompting. */
  force?: boolean;
}

export interface InstallHookResult {
  hookPath: string;
  gitignoreUpdated: boolean;
  replaced: boolean;
}

const HOOK_CONTENT = `#!/bin/sh
npx doc-sync-check src --strict
`;

const GITIGNORE_ENTRY = `# doc-sync-check
.git/hooks/pre-commit.bak
`;

/**
 * Installs a pre-commit hook that runs doc-sync-check --strict.
 * Throws an Error (with a human-readable message) on failure.
 */
export async function installHook(options?: InstallHookOptions): Promise<InstallHookResult> {
  const cwd = options?.cwd ?? process.cwd();
  const force = options?.force ?? false;

  // Resolve .git/ directory
  const gitDir = path.join(cwd, '.git');
  const gitExists = await fs.pathExists(gitDir);
  if (!gitExists) {
    throw new Error(
      `No Git repository found in ${cwd}. Run this command from the root of a Git repository.`
    );
  }

  // Ensure .git/hooks/ exists
  const hooksDir = path.join(gitDir, 'hooks');
  await fs.ensureDir(hooksDir);

  // Check for existing pre-commit hook
  const hookPath = path.join(hooksDir, 'pre-commit');
  const hookExists = await fs.pathExists(hookPath);
  let replaced = false;

  if (hookExists && !force) {
    throw new Error(
      `A pre-commit hook already exists at ${hookPath}. Use --force to overwrite it.`
    );
  }

  if (hookExists && force) {
    replaced = true;
  }

  // Write the hook file
  await fs.writeFile(hookPath, HOOK_CONTENT, 'utf-8');
  await fs.chmod(hookPath, 0o755);

  // Update .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  let gitignoreUpdated = false;

  const gitignoreExists = await fs.pathExists(gitignorePath);
  if (gitignoreExists) {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes('.git/hooks/pre-commit.bak')) {
      await fs.appendFile(gitignorePath, `\n${GITIGNORE_ENTRY}`);
      gitignoreUpdated = true;
    }
  } else {
    await fs.writeFile(gitignorePath, GITIGNORE_ENTRY, 'utf-8');
    gitignoreUpdated = true;
  }

  return { hookPath, gitignoreUpdated, replaced };
}
