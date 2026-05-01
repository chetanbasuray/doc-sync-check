#!/usr/bin/env node
import meow from 'meow';
import { globby } from 'globby';
import fs from 'fs-extra';
import path from 'path';
import { extractSignatures } from './extractor.js';
import { checkDrift, writeCoverageBadge } from './validator.js';

const cli = meow(`
	Usage
	  $ doc-sync-check <source-dir>

	Options
	  --docs, -d     Path to documentation folder (default: ./docs)
	  --include, -i  Custom glob patterns for documentation files
	  --coverage-out Path for doc coverage report JSON
	  --strict, -s   Fail on documentation drift (default: false)

	Examples
	  $ doc-sync-check src --docs ./documentation
	  $ doc-sync-check src --include "docs/**/*.md" "README.md"
	  $ doc-sync-check src --coverage-out ./coverage/doc-coverage.json --strict
`, {
	importMeta: import.meta,
	flags: {
		docs: {
			type: 'string',
			shortFlag: 'd',
			default: './docs'
		},
		include: {
			type: 'string',
			shortFlag: 'i',
			isMultiple: true
		},
		coverageOut: {
			type: 'string',
			default: ''
		},
		strict: {
			type: 'boolean',
			shortFlag: 's',
			default: false
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
    
    
    const docPatterns = cli.flags.include && cli.flags.include.length > 0
        ? cli.flags.include
        : [path.join(cli.flags.docs as string, '**/*.md')];

    console.log(`\n📚 Checking against documentation matching: ${JSON.stringify(docPatterns)}...`);
    const result = await checkDrift(allSigs, docPatterns);

    console.log(`\n📈 Coverage: ${result.coveragePercent}% documented (${result.documentedSymbols}/${allSigs.length})`);

    if (cli.flags.coverageOut) {
        await writeCoverageBadge(result, cli.flags.coverageOut);
    }

    if (result.hasDrift) {
        if (cli.flags.strict) {
            console.error("\n❌ Drift check failed. Please update your documentation.");
            process.exit(1);
        } else {
            console.warn("\n⚠️  Drift detected, but strict mode is OFF. Exiting with success.");
        }
    }
    
    console.log("\n✅ Drift check complete. No issues found.");
}

run();
