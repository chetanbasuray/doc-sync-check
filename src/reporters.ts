import fs from 'fs-extra';
import type { DriftResult, DriftFinding } from './validator.js';

export const isGithubActions = (): boolean => process.env.GITHUB_ACTIONS === 'true';

// GitHub escapes command data and properties differently; see the workflow-command spec.
const escapeData = (value: string): string =>
  value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const escapeProperty = (value: string): string =>
  escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');

const titleFor = (finding: DriftFinding): string => {
  switch (finding.kind) {
    case 'drift':
      return 'Documentation drift';
    case 'description-drift':
      return 'Description drift';
    case 'unused-doc-block':
      return 'Unused documentation block';
    default:
      return 'Undocumented export';
  }
};

const annotationBody = (finding: DriftFinding): string =>
  finding.expected ? `${finding.message} Expected: ${finding.expected}` : finding.message;

// Emit GitHub Actions workflow commands so findings surface inline on the PR diff.
export function emitGithubAnnotations(
  findings: DriftFinding[],
  log: (line: string) => void = console.log,
): void {
  for (const finding of findings) {
    const props = [`title=${escapeProperty(titleFor(finding))}`];
    if (finding.file) props.push(`file=${escapeProperty(finding.file)}`);
    if (finding.line) props.push(`line=${finding.line}`);
    log(`::${finding.severity} ${props.join(',')}::${escapeData(annotationBody(finding))}`);
  }
}

const summaryTable = (result: DriftResult): string => {
  const rows = result.findings.map((f) => {
    const location = f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '-';
    const target = f.symbol ?? f.expected ?? '-';
    return `| ${f.severity} | ${f.kind} | ${target} | ${location} |`;
  });
  const header = '| Severity | Kind | Symbol | Location |\n| --- | --- | --- | --- |';
  return rows.length > 0 ? `${header}\n${rows.join('\n')}` : '_No issues found._';
};

// Append a run summary to $GITHUB_STEP_SUMMARY when GitHub provides it.
export async function writeStepSummary(result: DriftResult): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const body = [
    '## doc-sync-check',
    '',
    `**Coverage:** ${result.coveragePercent}% documented ` +
      `(${result.inSyncSymbols} in sync, ${result.driftedSymbols} drifted, ${result.undocumentedSymbols} undocumented)`,
    '',
    summaryTable(result),
    '',
  ].join('\n');
  await fs.appendFile(summaryPath, body, 'utf-8');
}
