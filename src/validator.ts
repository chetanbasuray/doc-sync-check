import { globby } from 'globby';
import fs from 'fs-extra';
import type { FunctionSignature } from './extractor.js';

function normalizeSpace(str: string): string {
    return str.replace(/\s+/g, ' ').trim();
}

export async function checkDrift(signatures: FunctionSignature[], docPatterns: string | string[]): Promise<boolean> {
    const mdFiles = await globby(docPatterns);
    if (mdFiles.length === 0) {
        console.warn(`No markdown files found matching patterns: ${JSON.stringify(docPatterns)}`);
        return false;
    }
    
    const docs = await Promise.all(mdFiles.map(async file => {
        const content = await fs.readFile(file, 'utf-8');
        return {
            path: file,
            content,
            normalizedContent: normalizeSpace(content)
        };
    }));

    let hasDrift = false;

    for (const sig of signatures) {
        const normalizedSig = normalizeSpace(sig.fullSignature);
        let nameFound = false;
        let signatureFound = false;

        for (const doc of docs) {
            // Check if the exact function name is present (bounded by non-word chars if possible, but includes is fine for now)
            // A simple includes might match 'a' inside 'banana', but 'sig.name' usually is a full word.
            const nameRegex = new RegExp(`\\b${sig.name}\\b`);
            if (nameRegex.test(doc.content)) {
                nameFound = true;
                if (doc.normalizedContent.includes(normalizedSig)) {
                    signatureFound = true;
                    break;
                }
            }
        }

        if (nameFound && !signatureFound) {
            console.error(`❌ DRIFT DETECTED: Function '${sig.name}' is mentioned in documentation, but the updated signature was not found.`);
            console.error(`   Expected to find: ${sig.fullSignature}`);
            hasDrift = true;
        } else if (nameFound && signatureFound) {
            console.log(`✅ IN SYNC: '${sig.name}' is correctly documented.`);
        } else {
            console.log(`⚠️  UNDOCUMENTED: '${sig.name}' was not found in any documentation.`);
        }
    }

    return hasDrift;
}
