import { globby } from 'globby';
import fs from 'fs-extra';
import path from 'path';
import { regex } from 'shorol';
import type { FunctionSignature } from './extractor.js';
import { normalizeSpace, stripDeprecatedMarker } from './utils.js';

const functionLikeBlock = regex().word().oneOrMore().whitespace().zeroOrMore().literal('(').toRegExp();

// 1-based line number of the given character offset within content.
const lineAt = (content: string, index: number): number =>
  index < 0 ? 1 : content.slice(0, index).split('\n').length;

// Location of the first substring/regex match in content, or null if absent.
const locate = (content: string, matcher: string | RegExp): { line: number } | null => {
  const index = typeof matcher === 'string' ? content.indexOf(matcher) : content.search(matcher);
  return index < 0 ? null : { line: lineAt(content, index) };
};

export type DriftFindingKind = 'drift' | 'undocumented' | 'unused-doc-block' | 'description-drift';

export interface DriftFinding {
  kind: DriftFindingKind;
  severity: 'error' | 'warning';
  message: string;
  symbol?: string;
  file?: string;
  line?: number;
  expected?: string;
}

export interface DriftResult {
  hasDrift: boolean;
  documentedSymbols: number;
  inSyncSymbols: number;
  driftedSymbols: number;
  undocumentedSymbols: number;
  unusedDocBlocks: string[];
  coveragePercent: number;
  descriptionDriftSymbols: string[];
  findings: DriftFinding[];
}

export interface CheckDriftOptions {
  checkDescriptions?: boolean;
}

// Bumped whenever the shape of a written JSON report changes, so consumers can
// detect the format they are reading. See the JSON report schema in the README.
export const REPORT_SCHEMA_VERSION = 1;

export interface CoverageReport extends DriftResult {
  schemaVersion: number;
  badgeUrl: string;
  generatedAt: string;
}

export interface SonarReport {
  schemaVersion: number;
  project: string;
  metrics: {
    documentedSymbols: number;
    inSyncSymbols: number;
    driftedSymbols: number;
    undocumentedSymbols: number;
    coveragePercent: number;
    unusedDocBlocks: number;
    descriptionDriftSymbols: number;
  };
  generatedAt: string;
}

export async function checkDrift(
  signatures: FunctionSignature[],
  docPatterns: string | string[],
  options: CheckDriftOptions = {},
): Promise<DriftResult> {
  const mdFiles = await globby(docPatterns);
  if (mdFiles.length === 0) {
    console.warn(`No markdown files found matching patterns: ${JSON.stringify(docPatterns)}`);
    return {
      hasDrift: false,
      documentedSymbols: 0,
      inSyncSymbols: 0,
      driftedSymbols: 0,
      undocumentedSymbols: signatures.length,
      unusedDocBlocks: [],
      coveragePercent: signatures.length === 0 ? 100 : 0,
      descriptionDriftSymbols: [],
      findings: signatures.map((sig) => ({
        kind: 'undocumented',
        severity: 'warning',
        symbol: sig.name,
        message: `'${sig.name}' was not found in any documentation.`,
      })),
    };
  }

  const docs = await Promise.all(
    mdFiles.map(async (file) => {
      const content = await fs.readFile(file, 'utf-8');
      return {
        path: file,
        content,
        normalizedContent: normalizeSpace(content),
        blocks: [...content.matchAll(/`([^`]+)`/g)].map((m) => ({
          text: normalizeSpace(m[1]),
          line: lineAt(content, m.index ?? 0),
        })),
      };
    }),
  );

  let hasDrift = false;
  let documentedSymbols = 0;
  let inSyncSymbols = 0;
  let driftedSymbols = 0;
  let undocumentedSymbols = 0;
  const descriptionDriftSymbols: string[] = [];
  const findings: DriftFinding[] = [];

  // Docs are not expected to carry the extractor's [deprecated] marker, so we
  // compare against the marker-free form on both sides.
  const knownSignatureBlocks = new Set<string>(
    signatures.map((sig) => stripDeprecatedMarker(normalizeSpace(sig.fullSignature))),
  );

  for (const sig of signatures) {
    const normalizedSig = stripDeprecatedMarker(normalizeSpace(sig.fullSignature));
    const nameRegex = regex().wordBoundary().literal(sig.name).wordBoundary().toRegExp();
    let mentionedIn: { path: string; content: string } | null = null;
    let signatureFound = false;

    for (const doc of docs) {
      if (nameRegex.test(doc.content)) {
        if (!mentionedIn) mentionedIn = doc;
        if (doc.normalizedContent.includes(normalizedSig)) {
          signatureFound = true;
          mentionedIn = doc;
          break;
        }
      }
    }

    if (mentionedIn) documentedSymbols += 1;
    const line = mentionedIn ? (locate(mentionedIn.content, nameRegex)?.line ?? undefined) : undefined;

    if (mentionedIn && !signatureFound) {
      hasDrift = true;
      driftedSymbols += 1;
      findings.push({
        kind: 'drift',
        severity: 'error',
        symbol: sig.name,
        file: mentionedIn.path,
        line,
        expected: normalizedSig,
        message: `'${sig.name}' is mentioned in documentation, but its up-to-date signature was not found.`,
      });
      console.error(`❌ DRIFT: '${sig.name}' is stale in ${mentionedIn.path}${line ? `:${line}` : ''}`);
      console.error('   Replace the documented signature with:');
      console.error(`     \`${normalizedSig}\``);
    } else if (mentionedIn && signatureFound) {
      console.log(`✅ IN SYNC: '${sig.name}' is correctly documented.`);
      inSyncSymbols += 1;
      if (options.checkDescriptions && sig.jsDocDescription) {
        const descriptionFound = docs.some((doc) =>
          doc.normalizedContent.toLowerCase().includes(normalizeSpace(sig.jsDocDescription ?? '').toLowerCase()),
        );
        if (!descriptionFound) {
          hasDrift = true;
          descriptionDriftSymbols.push(sig.name);
          findings.push({
            kind: 'description-drift',
            severity: 'error',
            symbol: sig.name,
            file: mentionedIn.path,
            line,
            message: `'${sig.name}' JSDoc description was not found in the documentation.`,
          });
          console.error(`❌ DESCRIPTION DRIFT: '${sig.name}' JSDoc description not found in docs.`);
        }
      }
    } else {
      undocumentedSymbols += 1;
      findings.push({
        kind: 'undocumented',
        severity: 'warning',
        symbol: sig.name,
        message: `'${sig.name}' was not found in any documentation.`,
      });
      console.log(`⚠️  UNDOCUMENTED: '${sig.name}' was not found in any documentation.`);
    }
  }

  const unusedDocBlocks: string[] = [];
  const seenUnused = new Set<string>();
  for (const doc of docs) {
    for (const block of doc.blocks) {
      const stripped = stripDeprecatedMarker(block.text);
      if (!functionLikeBlock.test(block.text) || knownSignatureBlocks.has(stripped) || seenUnused.has(stripped)) {
        continue;
      }
      seenUnused.add(stripped);
      unusedDocBlocks.push(block.text);
      hasDrift = true;
      findings.push({
        kind: 'unused-doc-block',
        severity: 'error',
        file: doc.path,
        line: block.line,
        message: `Documented signature '${block.text}' is not present in source exports.`,
      });
    }
  }

  if (unusedDocBlocks.length > 0) {
    console.error('❌ UNUSED DOC BLOCKS: Found signature blocks not present in source exports.');
    unusedDocBlocks.forEach((block) => console.error(`   - ${block}`));
  }

  const coveragePercent = signatures.length === 0
    ? 100
    : Math.round((documentedSymbols / signatures.length) * 100);

  return {
    hasDrift,
    documentedSymbols,
    inSyncSymbols,
    driftedSymbols,
    undocumentedSymbols,
    unusedDocBlocks,
    coveragePercent,
    descriptionDriftSymbols,
    findings,
  };
}

export async function writeCoverageBadge(result: DriftResult, outputPath: string): Promise<void> {
  const color = result.coveragePercent >= 90 ? 'brightgreen' : result.coveragePercent >= 70 ? 'yellow' : 'red';
  const badgeUrl = `https://img.shields.io/badge/doc_coverage-${result.coveragePercent}%25-${color}`;
  const payload: CoverageReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    ...result,
    badgeUrl,
    generatedAt: new Date().toISOString(),
  };
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`📊 Doc coverage report written: ${outputPath}`);
  console.log(`🏷️  Suggested badge: ${badgeUrl}`);
}

export async function writeSonarReport(result: DriftResult, outputPath: string): Promise<void> {
  const payload: SonarReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    project: 'doc-sync-check',
    metrics: {
      documentedSymbols: result.documentedSymbols,
      inSyncSymbols: result.inSyncSymbols,
      driftedSymbols: result.driftedSymbols,
      undocumentedSymbols: result.undocumentedSymbols,
      coveragePercent: result.coveragePercent,
      unusedDocBlocks: result.unusedDocBlocks.length,
      descriptionDriftSymbols: result.descriptionDriftSymbols.length,
    },
    generatedAt: new Date().toISOString(),
  };
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function writeCoberturaReport(result: DriftResult, outputPath: string): Promise<void> {
  const lineRate = Math.max(0, Math.min(1, result.coveragePercent / 100));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<coverage line-rate="${lineRate.toFixed(2)}" branch-rate="0" version="1.0" timestamp="${Date.now()}">
  <packages>
    <package name="doc-sync-check" line-rate="${lineRate.toFixed(2)}" branch-rate="0">
      <classes>
        <class name="documentation" filename="docs" line-rate="${lineRate.toFixed(2)}" branch-rate="0">
          <methods/>
          <lines/>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, xml, 'utf-8');
}
