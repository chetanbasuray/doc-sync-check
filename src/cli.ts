#!/usr/bin/env node
import meow from 'meow';
import { globby } from 'globby';
import fs from 'fs-extra';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { extractSignatures } from './extractor.js';
import { checkDrift } from './validator.js';

// Workaround for Babel traverse ESM export quirk
const traverse = ((_traverse as any).default || _traverse) as typeof _traverse;

const cli = meow(`
	Usage
	  $ doc-sync-check <source-dir>

	Options
	  --docs, -d  Path to documentation folder (default: ./docs)

	Examples
	  $ doc-sync-check src --docs ./documentation
`, {
	importMeta: import.meta,
	flags: {
		docs: {
			type: 'string',
			shortFlag: 'd',
			default: './docs'
		}
	}
});

async function run() {
    const sourceDir = cli.input[0];

    if (!sourceDir) {
        console.error("Please specify a source directory.");
        process.exit(1);
    }

    console.log(`🔍 Scanning ${sourceDir} for documentation drift...`);

    // 1. Find all TypeScript files
    const files = await globby(`${sourceDir}/**/*.ts`);
    
    const allSigs = [];

    for (const file of files) {
        const code = fs.readFileSync(file, 'utf-8');
        const sigs = extractSignatures(code);
        
        if (sigs.length > 0) {
            allSigs.push(...sigs);
        }
    }
    
    console.log(`\n📚 Checking against documentation in ${cli.flags.docs}...`);
    const hasDrift = await checkDrift(allSigs, cli.flags.docs as string);

    if (hasDrift) {
        console.error("\n❌ Drift check failed. Please update your documentation.");
        process.exit(1);
    }
    
    console.log("\n✅ Drift check complete. No issues found.");
}

run();