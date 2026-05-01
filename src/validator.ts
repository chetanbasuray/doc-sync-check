import { globby } from 'globby';
import fs from 'fs-extra';
import path from 'path';
import type { FunctionSignature } from './extractor.js';

function normalizeSpace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

const escapeLiteral = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const signatureLiterals = (content: string): string[] => {
  const matches = content.match(/`([^`]+)`/g) ?? [];
  return matches.map((m) => normalizeSpace(m.slice(1, -1)));
};

export interface DriftResult {
  hasDrift: boolean;
  documentedSymbols: number;
  inSyncSymbols: number;
  driftedSymbols: number;
  undocumentedSymbols: number;
  unusedDocBlocks: string[];
  coveragePercent: number;
}

export async function checkDrift(signatures: FunctionSignature[], docPatterns: string | string[]): Promise<DriftResult> {
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
    };
  }

  const docs = await Promise.all(
    mdFiles.map(async (file) => {
      const content = await fs.readFile(file, 'utf-8');
      return {
        path: file,
        content,
        normalizedContent: normalizeSpace(content),
        signatureBlocks: signatureLiterals(content),
      };
    }),
  );

  let hasDrift = false;
  let documentedSymbols = 0;
  let inSyncSymbols = 0;
  let driftedSymbols = 0;
  let undocumentedSymbols = 0;
  const allDocSignatureBlocks = new Set<string>();

  docs.forEach((doc) => {
    doc.signatureBlocks.forEach((block) => allDocSignatureBlocks.add(block));
  });

  const knownSignatureBlocks = new Set<string>(signatures.map((sig) => normalizeSpace(sig.fullSignature)));

  for (const sig of signatures) {
    const normalizedSig = normalizeSpace(sig.fullSignature);
    const nameRegex = new RegExp(`\\b${escapeLiteral(sig.name)}\\b`);
    let nameFound = false;
    let signatureFound = false;

    for (const doc of docs) {
      if (nameRegex.test(doc.content)) {
        nameFound = true;
        if (doc.normalizedContent.includes(normalizedSig)) {
          signatureFound = true;
          break;
        }
      }
    }

    if (nameFound) documentedSymbols += 1;

    if (nameFound && !signatureFound) {
      console.error(`❌ DRIFT DETECTED: Symbol '${sig.name}' is mentioned in documentation, but the updated signature was not found.`);
      console.error(`   Expected to find: ${sig.fullSignature}`);
      hasDrift = true;
      driftedSymbols += 1;
    } else if (nameFound && signatureFound) {
      console.log(`✅ IN SYNC: '${sig.name}' is correctly documented.`);
      inSyncSymbols += 1;
    } else {
      console.log(`⚠️  UNDOCUMENTED: '${sig.name}' was not found in any documentation.`);
      undocumentedSymbols += 1;
    }
  }

  const unusedDocBlocks = [...allDocSignatureBlocks].filter(
    (block) => /\w+\s*\(/.test(block) && !knownSignatureBlocks.has(block),
  );

  if (unusedDocBlocks.length > 0) {
    hasDrift = true;
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
  };
}

export async function writeCoverageBadge(result: DriftResult, outputPath: string): Promise<void> {
  const color = result.coveragePercent >= 90 ? 'brightgreen' : result.coveragePercent >= 70 ? 'yellow' : 'red';
  const badgeUrl = `https://img.shields.io/badge/doc_coverage-${result.coveragePercent}%25-${color}`;
  const payload = {
    ...result,
    badgeUrl,
    generatedAt: new Date().toISOString(),
  };
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`📊 Doc coverage report written: ${outputPath}`);
  console.log(`🏷️  Suggested badge: ${badgeUrl}`);
}
