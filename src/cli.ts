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
import { DEFAULT_CONFIG_PATH, loadFileConfig, type FileConfig } from './config.js';

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
	  --config              Config file path (default: .doc-sync-checkrc.json)
	  --init                Write a starter .doc-sync-checkrc.json

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
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      init: { type: 'boolean', default: false },
    },
  },
);

// meow always supplies defaults, so we inspect argv to tell an explicitly
// passed flag from a default. Explicit flags win over the config file.
const flagWasProvided = (name: string, shortFlag?: string): boolean => {
  const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return process.argv.slice(2).some((token) =>
    token === `--${kebab}` ||
    token.startsWith(`--${kebab}=`) ||
    token === `--no-${kebab}` ||
    token === `--${name}` ||
    token.startsWith(`--${name}=`) ||
    (!!shortFlag && (token === `-${shortFlag}` || token.startsWith(`-${shortFlag}=`))),
  );
};

async function runInitWizard(configPath: string): Promise<void> {
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
    await runInitWizard(cli.flags.config);
    return;
  }

  const sourceDir = cli.input[0];
  if (!sourceDir) {
    console.error('Please specify a source directory.');
    process.exit(1);
  }

  const fileConfig = await loadFileConfig(cli.flags.config);
  const resolve = <K extends keyof typeof cli.flags & keyof FileConfig>(
    key: K,
    shortFlag?: string,
  ): NonNullable<FileConfig[K]> => {
    if (flagWasProvided(key, shortFlag) || fileConfig[key] === undefined) {
      return cli.flags[key] as NonNullable<FileConfig[K]>;
    }
    return fileConfig[key] as NonNullable<FileConfig[K]>;
  };

  const docs = resolve('docs', 'd');
  const include = resolve('include', 'i');
  const strict = resolve('strict', 's');
  const useCache = resolve('cache');
  const cacheFile = resolve('cacheFile');
  const coverageOut = resolve('coverageOut');
  const coverageFormat = resolve('coverageFormat');
  const slackWebhook = resolve('slackWebhook');
  const discordWebhook = resolve('discordWebhook');
  const fixDocs = resolve('fixDocs');
  const checkDescriptions = resolve('checkDescriptions');
  const updateReadme = resolve('updateReadme');
  const readmePath = resolve('readmePath');

  const docPatterns =
    include && include.length > 0
      ? include
      : [
          path.join(docs, '**/*.md'),
          'README.md',
          'website/docs/**/*.md',
          'docs/**/*.md',
          '.vuepress/**/*.md',
        ];

  if (fixDocs) {
    await normalizeDocBlocks(docPatterns);
  }

  const files = await parseSourceFiles(sourceDir);
  const cache = useCache ? await loadCache(cacheFile) : { version: 1 as const, files: {} };
  const nextCache = { version: 1 as const, files: { ...cache.files } };
  const allSigs = [];

  for (const file of files) {
    const stat = await fs.stat(file);
    const code = await fs.readFile(file, 'utf-8');
    const hash = contentHash(code);
    const cached = cache.files[file];

    if (useCache && cached && cached.mtimeMs === stat.mtimeMs && cached.hash === hash) {
      allSigs.push(...cached.signatures);
      continue;
    }

    const isJavaScript = /\.(jsx?|mjs|cjs)$/.test(file);
    const sigs = extractSignatures(code, { isJavaScript });
    allSigs.push(...sigs);
    nextCache.files[file] = { mtimeMs: stat.mtimeMs, hash, signatures: sigs };
  }

  if (useCache) {
    await saveCache(cacheFile, nextCache);
  }

  if (updateReadme) {
    await updateReadmeFunctions(readmePath, allSigs);
  }

  const result = await checkDrift(allSigs, docPatterns, { checkDescriptions });

  console.log(`\n📈 Coverage: ${result.coveragePercent}% documented (${result.documentedSymbols}/${allSigs.length})`);

  if (coverageOut) {
    if (coverageFormat === 'sonar') await writeSonarReport(result, coverageOut);
    else if (coverageFormat === 'cobertura') await writeCoberturaReport(result, coverageOut);
    else await writeCoverageBadge(result, coverageOut);
  }

  if (result.hasDrift) {
    await notifyDriftFailure({
      slackWebhook,
      discordWebhook,
      project: path.basename(process.cwd()),
      driftedSymbols: result.driftedSymbols,
      undocumentedSymbols: result.undocumentedSymbols,
      unusedDocBlocks: result.unusedDocBlocks.length,
      coveragePercent: result.coveragePercent,
    });

    if (strict) {
      console.error('\n❌ Drift check failed. Please update your documentation.');
      process.exit(1);
    }

    console.warn('\n⚠️  Drift detected, but strict mode is OFF. Exiting with success.');
  } else {
    console.log('\n✅ Drift check complete. No issues found.');
  }
}

run().catch((error) => {
  console.error('doc-sync-check failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
