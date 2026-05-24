import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkDrift } from '../src/validator.js';
import type { FunctionSignature } from '../src/extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Validator (1.3.0 scope)', () => {
  const tempDocsDir = path.join(__dirname, 'temp_docs');

  beforeEach(async () => {
    await fs.ensureDir(tempDocsDir);
  });

  afterEach(async () => {
    await fs.remove(tempDocsDir);
  });

  it('returns no drift when all documented signatures are in sync', async () => {
    const sigs: FunctionSignature[] = [
      {
        name: 'Auth.validate',
        parameters: ['token: string'],
        returnType: ': boolean',
        fullSignature: 'Auth.validate(token: string): boolean',
      },
    ];
    await fs.writeFile(path.join(tempDocsDir, 'docs.md'), '`Auth.validate(token: string): boolean`');
    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));
    expect(result.hasDrift).toBe(false);
    expect(result.inSyncSymbols).toBe(1);
    expect(result.coveragePercent).toBe(100);
  });

  it('flags drift when symbol is mentioned but signature changed', async () => {
    const sigs: FunctionSignature[] = [
      {
        name: 'compute',
        parameters: ['v: number'],
        returnType: ': number',
        fullSignature: 'compute(v: number): number',
      },
    ];
    await fs.writeFile(path.join(tempDocsDir, 'docs.md'), '`compute(v: string): number`');
    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));
    expect(result.hasDrift).toBe(true);
    expect(result.driftedSymbols).toBe(1);
  });

  it('flags unused documentation signature blocks', async () => {
    const sigs: FunctionSignature[] = [
      {
        name: 'activeFn',
        parameters: [],
        returnType: ': void',
        fullSignature: 'activeFn(): void',
      },
    ];
    await fs.writeFile(
      path.join(tempDocsDir, 'docs.md'),
      '`activeFn(): void`\n\n`removedFn(x: string): boolean`',
    );
    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));
    expect(result.hasDrift).toBe(true);
    expect(result.unusedDocBlocks).toContain('removedFn(x: string): boolean');
  });

  it('normalizes whitespace inside inline code signatures before comparing', async () => {
    const sigs: FunctionSignature[] = [
      {
        name: 'formatName',
        parameters: ['first: string', 'last: string'],
        returnType: ': string',
        fullSignature: 'formatName(first: string, last: string): string',
      },
    ];
    await fs.writeFile(
      path.join(tempDocsDir, 'docs.md'),
      'Use `formatName(first: string,\n  last: string): string` for display labels.',
    );

    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));

    expect(result.hasDrift).toBe(false);
    expect(result.inSyncSymbols).toBe(1);
    expect(result.unusedDocBlocks).toEqual([]);
  });

  it('normalizes source signatures when checking formatted markdown content', async () => {
    const sigs: FunctionSignature[] = [
      {
        name: 'createUser',
        parameters: ['input: CreateUserInput'],
        returnType: ': Promise<User>',
        fullSignature: 'createUser(\n  input: CreateUserInput\n): Promise<User>',
      },
    ];
    await fs.writeFile(
      path.join(tempDocsDir, 'docs.md'),
      'Documented API: `createUser( input: CreateUserInput ): Promise<User>`.',
    );

    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));

    expect(result.hasDrift).toBe(false);
    expect(result.inSyncSymbols).toBe(1);
    expect(result.unusedDocBlocks).toEqual([]);
  });
});
