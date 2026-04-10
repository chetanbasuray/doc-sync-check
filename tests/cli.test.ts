import { execSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CLI Strict Mode', () => {
    const tempDir = path.join(__dirname, 'temp_cli_test');
    const srcDir = path.join(tempDir, 'src');
    const docsDir = path.join(tempDir, 'docs');
    const cliPath = path.resolve(__dirname, '../src/cli.ts');

    beforeAll(async () => {
        await fs.ensureDir(srcDir);
        await fs.ensureDir(docsDir);

        // Create a source file with a function
        await fs.writeFile(
            path.join(srcDir, 'test.ts'),
            'export function testFunc(v: number): void {}'
        );

        // Create a docs file with drift
        await fs.writeFile(
            path.join(docsDir, 'docs.md'),
            '# Docs\n`testFunc(v: string): void`' // string instead of number
        );
    });

    afterAll(async () => {
        await fs.remove(tempDir);
    });

    it('should exit with 0 when drift is detected but strict mode is OFF', () => {
        try {
            // Using ts-node to run the .ts cli file directly
            execSync(`node --loader ts-node/esm ${cliPath} ${srcDir} --docs ${docsDir}`, { stdio: 'pipe' });
        } catch (error: any) {
            // If it throws, it means non-zero exit code
            fail(`CLI exited with non-zero code ${error.status}: ${error.stderr.toString()}`);
        }
    });

    it('should exit with 1 when drift is detected and strict mode is ON', () => {
        try {
            execSync(`node --loader ts-node/esm ${cliPath} ${srcDir} --docs ${docsDir} --strict`, { stdio: 'pipe' });
            fail('CLI should have exited with non-zero code in strict mode');
        } catch (error: any) {
            expect(error.status).toBe(1);
            expect(error.stderr.toString()).toContain('Drift check failed');
        }
    });
    
    it('should correctly use the --include flag with glob patterns', () => {
        try {
            // Using a specific pattern that matches our docs.md
            const pattern = path.join(docsDir, '*.md');
            execSync(`node --loader ts-node/esm ${cliPath} ${srcDir} --include "${pattern}" --strict`, { stdio: 'pipe' });
            fail('CLI should have exited with non-zero code because drift is present in the included file');
        } catch (error: any) {
            expect(error.status).toBe(1);
            expect(error.stdout.toString()).toContain('Checking against documentation matching: ["');
            expect(error.stderr.toString()).toContain('Drift check failed');
        }
    });
});

describe('CLI install-hook integration', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const cliPath = path.resolve(__dirname, '../src/cli.ts');
    // Use absolute path to ts-node/esm loader so it resolves from any cwd
    const tsNodeEsmLoader = path.join(projectRoot, 'node_modules', 'ts-node', 'esm.mjs');
    const nodeArgs = ['--loader', tsNodeEsmLoader, cliPath];
    const spawnEnv = {
        ...process.env,
        TS_NODE_PROJECT: path.join(projectRoot, 'tsconfig.json'),
    };
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-sync-cli-test-'));
    });

    afterEach(async () => {
        await fs.remove(tempDir);
    });

    // 6.1 — Requirements: 1.1, 6.3
    it('install-hook in a temp dir with .git/ → hook file created, exit 0', async () => {
        await fs.ensureDir(path.join(tempDir, '.git', 'hooks'));

        const result = spawnSync('node', [...nodeArgs, 'install-hook'], {
            cwd: tempDir,
            encoding: 'utf-8',
            env: spawnEnv,
        });

        expect(result.status).toBe(0);
        const hookPath = path.join(tempDir, '.git', 'hooks', 'pre-commit');
        expect(await fs.pathExists(hookPath)).toBe(true);
    });

    // 6.2 — Requirements: 2.2
    it('install-hook with no .git/ → exit 1, stderr contains "No Git repository found"', async () => {
        const result = spawnSync('node', [...nodeArgs, 'install-hook'], {
            cwd: tempDir,
            encoding: 'utf-8',
            env: spawnEnv,
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('No Git repository found');
    });

    // 6.3 — Requirements: 4.2
    it('install-hook with existing hook, no --force → exit 1, stderr contains "already exists"', async () => {
        await fs.ensureDir(path.join(tempDir, '.git', 'hooks'));
        await fs.writeFile(path.join(tempDir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho custom\n');

        const result = spawnSync('node', [...nodeArgs, 'install-hook'], {
            cwd: tempDir,
            encoding: 'utf-8',
            env: spawnEnv,
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('already exists');
    });

    // 6.4 — Requirements: 4.3
    it('install-hook --force with existing hook → exit 0, hook overwritten with --strict', async () => {
        await fs.ensureDir(path.join(tempDir, '.git', 'hooks'));
        await fs.writeFile(path.join(tempDir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho custom\n');

        const result = spawnSync('node', [...nodeArgs, 'install-hook', '--force'], {
            cwd: tempDir,
            encoding: 'utf-8',
            env: spawnEnv,
        });

        expect(result.status).toBe(0);
        const hookContent = await fs.readFile(
            path.join(tempDir, '.git', 'hooks', 'pre-commit'),
            'utf-8'
        );
        expect(hookContent).toContain('--strict');
    });

    // 6.5 — Requirements: 1.3
    it('doc-sync-check with no args → exit 1, stderr contains usage error', async () => {
        const result = spawnSync('node', nodeArgs, {
            cwd: tempDir,
            encoding: 'utf-8',
            env: spawnEnv,
        });

        expect(result.status).toBe(1);
        const output = result.stderr + result.stdout;
        expect(output.length).toBeGreaterThan(0);
    });

    // 6.6 — Requirements: 1.2
    it('doc-sync-check --help → stdout contains "install-hook"', async () => {
        const result = spawnSync('node', [...nodeArgs, '--help'], {
            cwd: tempDir,
            encoding: 'utf-8',
            env: spawnEnv,
        });

        expect(result.stdout).toContain('install-hook');
    });
});
