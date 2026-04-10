#!/usr/bin/env node
import meow from 'meow';
import { globby } from 'globby';
import fs from 'fs-extra';
import path from 'path';
import { extractSignatures } from './extractor.js';
import { checkDrift } from './validator.js';
import { installHook } from './installer.js';

const cli = meow(`
	Usage
	  $ doc-sync-check <source-dir>
	  $ doc-sync-check install-hook

	Commands
	  install-hook   Install a Git pre-commit hook that runs doc-sync-check --strict

	Options
	  --docs, -d     Path to documentation folder (default: ./docs)
	  --include, -i  Custom glob patterns for documentation files
	  --strict, -s   Fail on documentation drift (default: false)
	  --force, -f    Overwrite an existing pre-commit hook (default: false)

	Examples
	  $ doc-sync-check src --docs ./documentation
	  $ doc-sync-check src --include "docs/**/*.md" "README.md"
	  $ doc-sync-check install-hook
	  $ doc-sync-check install-hook --force
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
		strict: {
			type: 'boolean',
			shortFlag: 's',
			default: false
		},
		force: {
			type: 'boolean',
			shortFlag: 'f',
			default: false
		}
	}
});

async function run() {
    if (cli.input[0] === 'install-hook') {
        try {
            const result = await installHook({ cwd: process.cwd(), force: cli.flags.force });
            console.log(`✅ Pre-commit hook installed at ${result.hookPath}`);
            if (result.replaced) {
                console.log('♻️  Existing hook was replaced.');
            }
            if (result.gitignoreUpdated) {
                console.log('📝 .gitignore updated with backup file entry.');
            }
            process.exit(0);
        } catch (error) {
            process.stderr.write(`Error: ${(error as Error).message}\n`);
            process.exit(1);
        }
    } else {
        const sourceDir = cli.input[0];

        if (!sourceDir) {
            console.error("Please specify a source directory or use the 'install-hook' subcommand.");
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
        const hasDrift = await checkDrift(allSigs, docPatterns);

        if (hasDrift) {
            if (cli.flags.strict) {
                console.error("\n❌ Drift check failed. Please update your documentation.");
                process.exit(1);
            } else {
                console.warn("\n⚠️  Drift detected, but strict mode is OFF. Exiting with success.");
            }
        }
        
        console.log("\n✅ Drift check complete. No issues found.");
    }
}

run();
