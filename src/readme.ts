import fs from 'fs-extra';
import type { FunctionSignature } from './extractor.js';

const START = '<!-- DOC_SYNC_FUNCTIONS_START -->';
const END = '<!-- DOC_SYNC_FUNCTIONS_END -->';

export async function updateReadmeFunctions(readmePath: string, signatures: FunctionSignature[]): Promise<void> {
  if (!(await fs.pathExists(readmePath))) return;
  const content = await fs.readFile(readmePath, 'utf-8');
  const markerStart = content.indexOf(START);
  const markerEnd = content.indexOf(END);
  if (markerStart === -1 || markerEnd === -1 || markerEnd < markerStart) return;

  const items = signatures.map((sig) => `- \`${sig.fullSignature}\``).join('\n');
  const next = `${content.slice(0, markerStart + START.length)}\n${items}\n${content.slice(markerEnd)}`;
  await fs.writeFile(readmePath, next, 'utf-8');
}
