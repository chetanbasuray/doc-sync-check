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
import { emitGithubAnnotations, isGithubActions, writeStepSummary } from './reporters.js';

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
	  --min-coverage        Fail if documented coverage is below this percent
	  --annotate            Emit GitHub Actions annotations (default: auto in CI)
	  --init                Write a starter .doc-sync-checkrc.json

	Examples
	  $ doc-sync-check src --docs ./documentation --strict
	  $ doc-sync-check src --coverage-out ./coverage/doc-coverage.json --coverage-format sonar
`,
  {
    importMeta: import.meta,
    flags: {
      // No defaults here: an unset flag stays undefined so config-file values
      // can fill in, while an explicit flag (including --no-*) still wins.
      docs: { type: 'string', shortFlag: 'd' },
      include: { type: 'string', shortFlag: 'i', isMultiple: true },
      coverageOut: { type: 'string' },
      coverageFormat: { type: 'string' },
      strict: { type: 'boolean', shortFlag: 's' },
      cache: { type: 'boolean' },
      cacheFile: { type: 'string' },
      slackWebhook: { type: 'string' },
      discordWebhook: { type: 'string' },
      fixDocs: { type: 'boolean' },
      checkDescriptions: { type: 'boolean' },
      updateReadme: { type: 'boolean' },
      readmePath: { type: 'string' },
      annotate: { type: 'boolean' },
      minCoverage: { type: 'number' },
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      init: { type: 'boolean', default: false },
    },
  },
);

const DEFAULTS = {
  docs: './docs',
  coverageOut: '',
  coverageFormat: 'json',
  strict: false,
  cache: true,
  cacheFile: DEFAULT_CACHE_PATH,
  slackWebhook: '',
  discordWebhook: '',
  fixDocs: false,
  checkDescriptions: false,
  updateReadme: false,
  readmePath: './README.md',
};

// meow coerces an unset boolean flag to false, so it cannot tell "unset" from
// an explicit --no-flag. We scan argv (up to the `--` separator) to know which
// flags the user actually passed, so those override the config file.
const passedArgs = (() => {
  const argv = process.argv.slice(2);
  const separator = argv.indexOf('--');
  return separator === -1 ? argv : argv.slice(0, separator);
})();

const flagWasProvided = (name: string, shortFlag?: string): boolean => {
  const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return passedArgs.some((token) => {
    if (token === `--${kebab}` || token.startsWith(`--${kebab}=`)) return true;
    if (token === `--no-${kebab}` || token === `--no-${name}`) return true;
    if (token === `--${name}` || token.startsWith(`--${name}=`)) return true;
    if (shortFlag && token.startsWith('-') && !token.startsWith('--')) {
      return token.slice(1).split('=')[0].includes(shortFlag);
    }
    return false;
  });
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
  // Precedence: an explicitly passed flag wins, else the config file, else the
  // built-in default. `?? DEFAULTS` also lets a null config value fall through.
  const pick = <K extends keyof typeof DEFAULTS & keyof FileConfig>(
    key: K,
    shortFlag?: string,
  ): (typeof DEFAULTS)[K] => {
    if (flagWasProvided(key, shortFlag)) return cli.flags[key] as (typeof DEFAULTS)[K];
    return (fileConfig[key] ?? DEFAULTS[key]) as (typeof DEFAULTS)[K];
  };

  const docs = pick('docs', 'd');
  const include = flagWasProvided('include', 'i')
    ? (cli.flags.include ?? [])
    : (fileConfig.include ?? []);
  const strict = pick('strict', 's');
  const useCache = pick('cache');
  const cacheFile = pick('cacheFile');
  const coverageOut = pick('coverageOut');
  const coverageFormat = pick('coverageFormat');
  const slackWebhook = pick('slackWebhook');
  const discordWebhook = pick('discordWebhook');
  const fixDocs = pick('fixDocs');
  const checkDescriptions = pick('checkDescriptions');
  const updateReadme = pick('updateReadme');
  const readmePath = pick('readmePath');
  const annotate = flagWasProvided('annotate')
    ? Boolean(cli.flags.annotate)
    : (fileConfig.annotate ?? isGithubActions());
  const minCoverageRaw = flagWasProvided('minCoverage') ? cli.flags.minCoverage : fileConfig.minCoverage;
  if (minCoverageRaw !== undefined && !(typeof minCoverageRaw === 'number' && Number.isFinite(minCoverageRaw))) {
    console.error(`Invalid --min-coverage value: ${minCoverageRaw}. Expected a finite number.`);
    process.exit(1);
  }
  const minCoverage = minCoverageRaw as number | undefined;

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

  if (annotate) {
    emitGithubAnnotations(result.findings);
    await writeStepSummary(result);
  }

  if (coverageOut) {
    if (coverageFormat === 'sonar') await writeSonarReport(result, coverageOut);
    else if (coverageFormat === 'cobertura') await writeCoberturaReport(result, coverageOut);
    else await writeCoverageBadge(result, coverageOut);
  }

  let shouldFail = false;

  if (minCoverage !== undefined && result.coveragePercent < minCoverage) {
    console.error(`\n❌ Coverage ${result.coveragePercent}% is below the required minimum of ${minCoverage}%.`);
    shouldFail = true;
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
      shouldFail = true;
    } else {
      console.warn('\n⚠️  Drift detected, but strict mode is OFF.');
    }
  } else {
    console.log('\n✅ Drift check complete. No issues found.');
  }

  if (shouldFail) process.exit(1);
}

run().catch((error) => {
  console.error('doc-sync-check failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
