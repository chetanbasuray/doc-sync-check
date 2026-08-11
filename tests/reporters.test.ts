import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { emitGithubAnnotations, isGithubActions, writeStepSummary } from '../src/reporters.js';
import type { DriftFinding, DriftResult } from '../src/validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseResult = (findings: DriftFinding[]): DriftResult => ({
  hasDrift: findings.some((f) => f.severity === 'error'),
  documentedSymbols: 1,
  inSyncSymbols: 0,
  driftedSymbols: findings.filter((f) => f.kind === 'drift').length,
  undocumentedSymbols: findings.filter((f) => f.kind === 'undocumented').length,
  unusedDocBlocks: [],
  coveragePercent: 50,
  descriptionDriftSymbols: [],
  findings,
});

describe('emitGithubAnnotations', () => {
  it('emits a file-and-line error command for a drift finding', () => {
    const lines: string[] = [];
    emitGithubAnnotations(
      [{ kind: 'drift', severity: 'error', symbol: 'compute', file: 'docs/api.md', line: 5, expected: 'compute(v: number): number', message: 'stale' }],
      (line) => lines.push(line),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('::error title=Documentation drift,file=docs/api.md,line=5::stale Expected: compute(v: number): number');
  });

  it('emits a warning without file or line for an undocumented finding', () => {
    const lines: string[] = [];
    emitGithubAnnotations(
      [{ kind: 'undocumented', severity: 'warning', symbol: 'hidden', message: 'not documented' }],
      (line) => lines.push(line),
    );
    expect(lines[0]).toBe('::warning title=Undocumented export::not documented');
  });

  it('escapes newlines and commas in the message and file property', () => {
    const lines: string[] = [];
    emitGithubAnnotations(
      [{ kind: 'drift', severity: 'error', file: 'a,b.md', line: 1, message: 'line1\nline2' }],
      (line) => lines.push(line),
    );
    expect(lines[0]).toContain('file=a%2Cb.md');
    expect(lines[0]).toContain('line1%0Aline2');
  });
});

describe('writeStepSummary', () => {
  const tempDir = path.join(__dirname, 'temp_summary');

  beforeEach(async () => {
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    delete process.env.GITHUB_STEP_SUMMARY;
  });

  it('appends a coverage line and findings table to the summary file', async () => {
    const summaryPath = path.join(tempDir, 'summary.md');
    process.env.GITHUB_STEP_SUMMARY = summaryPath;
    await writeStepSummary(
      baseResult([{ kind: 'drift', severity: 'error', symbol: 'compute', file: 'docs/api.md', line: 5, message: 'stale' }]),
    );
    const written = await fs.readFile(summaryPath, 'utf-8');
    expect(written).toContain('Coverage:** 50% documented');
    expect(written).toContain('| error | drift | compute | docs/api.md:5 |');
  });

  it('does nothing when GITHUB_STEP_SUMMARY is not set', async () => {
    delete process.env.GITHUB_STEP_SUMMARY;
    await expect(writeStepSummary(baseResult([]))).resolves.toBeUndefined();
  });
});

describe('isGithubActions', () => {
  const original = process.env.GITHUB_ACTIONS;
  afterEach(() => {
    if (original === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = original;
  });

  it('is true only when GITHUB_ACTIONS equals the string "true"', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(isGithubActions()).toBe(true);
    process.env.GITHUB_ACTIONS = 'false';
    expect(isGithubActions()).toBe(false);
  });
});
