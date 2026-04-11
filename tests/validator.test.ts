import { checkDrift } from '../src/validator.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Validator', () => {
    const tempDocsDir = path.join(__dirname, 'temp_docs');

    beforeEach(async () => {
        await fs.ensureDir(tempDocsDir);
    });

    afterEach(async () => {
        await fs.remove(tempDocsDir);
    });

    it('should return false when no drift is detected', async () => {
        const sigs = [
            {
                name: 'testFunc',
                parameters: ['arg1: string'],
                returnType: ': void',
                fullSignature: 'testFunc(arg1: string): void'
            }
        ];

        await fs.writeFile(
            path.join(tempDocsDir, 'docs.md'),
            '# Docs\n`testFunc(arg1: string): void`'
        );

        const hasDrift = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));
        expect(hasDrift).toBe(false);
    });

    it('should return true when drift is detected', async () => {
        const sigs = [
            {
                name: 'testFunc',
                parameters: ['arg1: number'], // changed from string to number
                returnType: ': void',
                fullSignature: 'testFunc(arg1: number): void'
            }
        ];

        await fs.writeFile(
            path.join(tempDocsDir, 'docs.md'),
            '# Docs\n`testFunc(arg1: string): void`'
        );

        const hasDrift = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));
        expect(hasDrift).toBe(true);
    });

    it('should return false for undocumented functions (not considered drift)', async () => {
        const sigs = [
            {
                name: 'undocumentedFunc',
                parameters: [],
                returnType: ': void',
                fullSignature: 'undocumentedFunc(): void'
            }
        ];

        await fs.writeFile(
            path.join(tempDocsDir, 'docs.md'),
            '# Docs\nEmpty doc'
        );

        const hasDrift = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));
        expect(hasDrift).toBe(false);
    });
});
