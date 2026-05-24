#!/usr/bin/env node
import meow from 'meow';
import { globby } from 'globby';
import fs from 'fs-extra';
import path from 'path';
import { extractSignatures } from './extractor.js';
import {
  checkDrift,
  writeCoberturaReport,
  writeCoverageBadge,
  writeSonarReport,
} from './validator.js';
import { contentHash, DEFAULT_CACHE_PATH, loadCache, saveCache } from './cache.js';
import { notifyDriftFailure } from './integrations.js';
import { updateReadmeFunctions } from './readme.js';

const cli = meow(
  `
	Usage
	  $ doc-sync-check <source-dir>

	Options
	  --docs, -d            Path to documentation folder (default: ./docs)
	  --include, -i         Custom glob patterns for documentation files
	  --coverage-out        Path for doc coverage report JSON
	  --coverage-format     json|sonar|cobertura
	  --strict, -s          Fail on documentation drift (default: false)
	  --cache               Enable incremental cache (default: true)
	  --cache-file          Cache file path (default: .doc-sync-cache.json)
	  --slack-webhook       Slack webhook URL for failure notifications
	  --discord-webhook     Discord webhook URL for failure notifications
	  --fix-docs            Auto-trim whitespace in markdown code signature blocks
	  --check-descriptions  Validate JSDoc descriptions appear in docs
	  --update-readme       Auto-write exported signatures to README markers
	  --readme-path         README path for --update-readme (default: ./README.md)
	  --init                Interactive setup wizard

	Examples
	  $ doc-sync-check src --docs ./documentation --strict
	  $ doc-sync-check src --coverage-out ./coverage/doc-coverage.json --coverage-format sonar
`,
  {
    importMeta: import.meta,
    flags: {
      docs: { type: 'string', shortFlag: 'd', default: './docs' },
      include: { type: 'string', shortFlag: 'i', isMultiple: true },
      coverageOut: { type: 'string', default: '' },
      coverageFormat: { type: 'string', default: 'json' },
      strict: { type: 'boolean', shortFlag: 's', default: false },
      cache: { type: 'boolean', default: true },
      cacheFile: { type: 'string', default: DEFAULT_CACHE_PATH },
      slackWebhook: { type: 'string', default: '' },
      discordWebhook: { type: 'string', default: '' },
      fixDocs: { type: 'boolean', default: false },
      checkDescriptions: { type: 'boolean', default: false },
      updateReadme: { type: 'boolean', default: false },
      readmePath: { type: 'string', default: './README.md' },
      init: { type: 'boolean', default: false },
    },
  },
);

async function runInitWizard(): Promise<void> {
  const configPath = '.doc-sync-checkrc.json';
  const template = {
    docs: './docs',
    include: ['docs/**/*.md', 'README.md', 'website/docs/**/*.md'],
    strict: true,
    cache: true,
    coverageOut: './coverage/doc-coverage.json',
    coverageFormat: 'json',
  };
  await fs.writeFile(configPath, JSON.stringify(template, null, 2), 'utf-8');
  console.log(`✅ Setup complete. Created ${configPath}`);
}

const parseSourceFiles = async (sourceDir: string): Promise<string[]> => {
  return globby([
    `${sourceDir}/**/*.ts`,
    `${sourceDir}/**/*.tsx`,
    `${sourceDir}/**/*.js`,
    `${sourceDir}/**/*.jsx`,
  ]);
};

const normalizeDocBlocks = async (docPatterns: string[]): Promise<void> => {
  const mdFiles = await globby(docPatterns);
  await Promise.all(
    mdFiles.map(async (file) => {
      const content = await fs.readFile(file, 'utf-8');
      const next = content.replace(/`\s*([^`]+?)\s*`/g, (_m, p1) => `\`${String(p1).trim()}\``);
      if (next !== content) await fs.writeFile(file, next, 'utf-8');
    }),
  );
};

async function run() {
  if (cli.flags.init) {
    await runInitWizard();
    return;
  }

  const sourceDir = cli.input[0];
  if (!sourceDir) {
    console.error('Please specify a source directory.');
    process.exit(1);
  }

  const docPatterns =
    cli.flags.include && cli.flags.include.length > 0
      ? cli.flags.include
      : [
          path.join(cli.flags.docs as string, '**/*.md'),
          'README.md',
          'website/docs/**/*.md',
          'docs/**/*.md',
          '.vuepress/**/*.md',
        ];

  if (cli.flags.fixDocs) {
    await normalizeDocBlocks(docPatterns);
  }

  const files = await parseSourceFiles(sourceDir);
  const cache = cli.flags.cache ? await loadCache(cli.flags.cacheFile) : { version: 1 as const, files: {} };
  const nextCache = { version: 1 as const, files: { ...cache.files } };
  const allSigs = [];

  for (const file of files) {
    const stat = await fs.stat(file);
    const code = await fs.readFile(file, 'utf-8');
    const hash = contentHash(code);
    const cached = cache.files[file];

    if (cli.flags.cache && cached && cached.mtimeMs === stat.mtimeMs && cached.hash === hash) {
      allSigs.push(...cached.signatures);
      continue;
    }

    const isJavaScript = /\.(jsx?|mjs|cjs)$/.test(file);
    const sigs = extractSignatures(code, { isJavaScript });
    allSigs.push(...sigs);
    nextCache.files[file] = { mtimeMs: stat.mtimeMs, hash, signatures: sigs };
  }

  if (cli.flags.cache) {
    await saveCache(cli.flags.cacheFile, nextCache);
  }

  if (cli.flags.updateReadme) {
    await updateReadmeFunctions(cli.flags.readmePath, allSigs);
  }

  const result = await checkDrift(allSigs, docPatterns, {
    checkDescriptions: cli.flags.checkDescriptions,
  });

  console.log(`\n📈 Coverage: ${result.coveragePercent}% documented (${result.documentedSymbols}/${allSigs.length})`);

  if (cli.flags.coverageOut) {
    const format = String(cli.flags.coverageFormat);
    if (format === 'sonar') await writeSonarReport(result, cli.flags.coverageOut);
    else if (format === 'cobertura') await writeCoberturaReport(result, cli.flags.coverageOut);
    else await writeCoverageBadge(result, cli.flags.coverageOut);
  }

  if (result.hasDrift) {
    await notifyDriftFailure({
      slackWebhook: cli.flags.slackWebhook,
      discordWebhook: cli.flags.discordWebhook,
      project: path.basename(process.cwd()),
      driftedSymbols: result.driftedSymbols,
      undocumentedSymbols: result.undocumentedSymbols,
      unusedDocBlocks: result.unusedDocBlocks.length,
      coveragePercent: result.coveragePercent,
    });

    if (cli.flags.strict) {
      console.error('\n❌ Drift check failed. Please update your documentation.');
      process.exit(1);
    }

    console.warn('\n⚠️  Drift detected, but strict mode is OFF. Exiting with success.');
  } else {
    console.log('\n✅ Drift check complete. No issues found.');
  }
}

run();
