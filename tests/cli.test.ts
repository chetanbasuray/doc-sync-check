import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe.skip('CLI Strict Mode', () => {
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
        expect(() => {
            execSync(`node --loader ts-node/esm ${cliPath} ${srcDir} --docs ${docsDir}`, { stdio: 'pipe' });
        }).not.toThrow();
    });

    it('should exit with 1 when drift is detected and strict mode is ON', () => {
        expect(() => {
            execSync(`node --loader ts-node/esm ${cliPath} ${srcDir} --docs ${docsDir} --strict`, { stdio: 'pipe' });
        }).toThrow();
    });
    
    it('should correctly use the --include flag with glob patterns', () => {
        const pattern = path.join(docsDir, '*.md');
        expect(() => {
            execSync(`node --loader ts-node/esm ${cliPath} ${srcDir} --include "${pattern}" --strict`, { stdio: 'pipe' });
        }).toThrow();
    });
});
