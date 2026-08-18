import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  checkDrift,
  writeCoverageBadge,
  writeSonarReport,
  REPORT_SCHEMA_VERSION,
} from '../src/validator.js';
import type { DriftResult } from '../src/validator.js';
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

  it('treats a deprecated symbol as in sync when docs omit the [deprecated] marker', async () => {
    const sigs: FunctionSignature[] = [
      {
        name: 'legacy',
        parameters: ['value: string'],
        returnType: ': string',
        fullSignature: '[deprecated] legacy(value: string): string',
      },
    ];
    await fs.writeFile(path.join(tempDocsDir, 'docs.md'), 'Use `legacy(value: string): string` for now.');

    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));

    expect(result.hasDrift).toBe(false);
    expect(result.inSyncSymbols).toBe(1);
    expect(result.unusedDocBlocks).toEqual([]);
  });

  it('does not flag a deprecated doc block (with the marker) as unused', async () => {
    const sigs: FunctionSignature[] = [
      {
        name: 'legacy',
        parameters: ['value: string'],
        returnType: ': string',
        fullSignature: '[deprecated] legacy(value: string): string',
      },
    ];
    await fs.writeFile(path.join(tempDocsDir, 'docs.md'), '`[deprecated] legacy(value: string): string`');

    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));

    expect(result.hasDrift).toBe(false);
    expect(result.inSyncSymbols).toBe(1);
    expect(result.unusedDocBlocks).toEqual([]);
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

describe('Validator findings (annotations + hints)', () => {
  const tempDocsDir = path.join(__dirname, 'temp_findings');

  beforeEach(async () => {
    await fs.ensureDir(tempDocsDir);
  });

  afterEach(async () => {
    await fs.remove(tempDocsDir);
  });

  it('reports a drift finding with file, line, and the expected signature', async () => {
    const sigs: FunctionSignature[] = [
      {
        name: 'compute',
        parameters: ['v: number'],
        returnType: ': number',
        fullSignature: 'compute(v: number): number',
      },
    ];
    await fs.writeFile(
      path.join(tempDocsDir, 'docs.md'),
      '# API\n\nSome intro.\n\n`compute(v: string): number`\n',
    );
    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));

    const drift = result.findings.find((f) => f.kind === 'drift');
    expect(drift).toBeDefined();
    expect(drift?.severity).toBe('error');
    expect(drift?.symbol).toBe('compute');
    expect(drift?.expected).toBe('compute(v: number): number');
    expect(drift?.file).toContain('docs.md');
    expect(drift?.line).toBe(5);
  });

  it('reports undocumented symbols as warnings without a location', async () => {
    const sigs: FunctionSignature[] = [
      { name: 'hidden', parameters: [], returnType: ': void', fullSignature: 'hidden(): void' },
    ];
    await fs.writeFile(path.join(tempDocsDir, 'docs.md'), '# API\n\nNothing relevant here.\n');
    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));

    const undocumented = result.findings.find((f) => f.kind === 'undocumented');
    expect(undocumented?.severity).toBe('warning');
    expect(undocumented?.file).toBeUndefined();
  });

  it('reports every symbol as undocumented when no markdown files match', async () => {
    const sigs: FunctionSignature[] = [
      { name: 'alpha', parameters: [], returnType: ': void', fullSignature: 'alpha(): void' },
      { name: 'beta', parameters: [], returnType: ': void', fullSignature: 'beta(): void' },
    ];
    const result = await checkDrift(sigs, path.join(tempDocsDir, 'nope', '**/*.md'));

    expect(result.undocumentedSymbols).toBe(2);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.every((f) => f.kind === 'undocumented' && f.severity === 'warning')).toBe(true);
  });

  it('reports an unused doc block with its origin file and line', async () => {
    const sigs: FunctionSignature[] = [
      { name: 'activeFn', parameters: [], returnType: ': void', fullSignature: 'activeFn(): void' },
    ];
    await fs.writeFile(
      path.join(tempDocsDir, 'docs.md'),
      '`activeFn(): void`\n\n`removedFn(x: string): boolean`\n',
    );
    const result = await checkDrift(sigs, path.join(tempDocsDir, '**/*.md'));

    const unused = result.findings.find((f) => f.kind === 'unused-doc-block');
    expect(unused?.severity).toBe('error');
    expect(unused?.file).toContain('docs.md');
    expect(unused?.line).toBe(3);
  });
});

describe('JSON report schema', () => {
  const tempDir = path.join(__dirname, 'temp_reports');

  const sampleResult = (): DriftResult => ({
    hasDrift: true,
    documentedSymbols: 2,
    inSyncSymbols: 1,
    driftedSymbols: 1,
    undocumentedSymbols: 0,
    unusedDocBlocks: [],
    coveragePercent: 50,
    descriptionDriftSymbols: [],
    findings: [
      { kind: 'drift', severity: 'error', symbol: 'compute', file: 'docs/api.md', line: 5, expected: 'compute(v: number): number', message: 'stale' },
    ],
  });

  beforeEach(async () => {
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('stamps schemaVersion and carries findings in the coverage report', async () => {
    const out = path.join(tempDir, 'coverage.json');
    await writeCoverageBadge(sampleResult(), out);
    const report = JSON.parse(await fs.readFile(out, 'utf-8'));

    expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(report.coveragePercent).toBe(50);
    expect(report.findings[0]).toMatchObject({ kind: 'drift', file: 'docs/api.md', line: 5 });
    expect(typeof report.badgeUrl).toBe('string');
  });

  it('stamps schemaVersion in the sonar report', async () => {
    const out = path.join(tempDir, 'sonar.json');
    await writeSonarReport(sampleResult(), out);
    const report = JSON.parse(await fs.readFile(out, 'utf-8'));

    expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(report.metrics.coveragePercent).toBe(50);
  });
});
