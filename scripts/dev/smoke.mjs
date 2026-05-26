#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..', 'fixtures', 'repo-root');
const DEFAULT_PACKAGE_ID = 'fixture_package';

function parseArgs(argv) {
  let repoRoot = process.env.AI_PDLC_REPO_ROOT ?? DEFAULT_REPO_ROOT;
  let packageId = process.env.AI_PDLC_PACKAGE_ID ?? DEFAULT_PACKAGE_ID;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-root') {
      repoRoot = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--package-id') {
      packageId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument "${arg}".`);
  }

  if (!repoRoot) {
    throw new Error('Provide --repo-root <path> or set AI_PDLC_REPO_ROOT.');
  }

  if (!packageId) {
    throw new Error('Provide --package-id <id> or set AI_PDLC_PACKAGE_ID.');
  }

  return { repoRoot, packageId };
}

function printHelp() {
  console.log(
    [
      'Usage: node scripts/dev/smoke.mjs [--repo-root <path>] [--package-id <id>]',
      '',
      `Default repo root: ${DEFAULT_REPO_ROOT}`,
      `Default package id: ${DEFAULT_PACKAGE_ID}`
    ].join('\n')
  );
}

function extractText(result) {
  return result.content?.find(item => item.type === 'text')?.text ?? null;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const { repoRoot, packageId } = parseArgs(process.argv.slice(2));
  const normalizedRepoRoot = path.resolve(repoRoot);
  const usingFixture =
    normalizedRepoRoot === DEFAULT_REPO_ROOT && packageId === DEFAULT_PACKAGE_ID;
  const searchQuery = usingFixture ? 'AI-PDLC fixture' : 'AI-PDLC';
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['src/bin/ai-pdlc-mcp.mjs', '--repo-root', repoRoot]
  });
  const client = new Client({
    name: 'ai-pdlc-smoke',
    version: '0.1.0'
  });

  await client.connect(transport);
  const tools = await client.listTools();
  const resources = await client.listResources();
  const validation = await client.callTool({
    name: 'aipdlc_validate_feature_package',
    arguments: {
      package_id: packageId
    }
  });
  const search = await client.callTool({
    name: 'aipdlc_search_docs',
    arguments: {
      query: searchQuery,
      scope: 'all',
      max_results: 3
    }
  });
  const readme = await client.callTool({
    name: 'aipdlc_read_doc',
    arguments: {
      path: 'docs/ai-pdlc/README.md',
      start_line: 1,
      end_line: 20
    }
  });
  const summary = await client.callTool({
    name: 'get_feature_package_summary',
    arguments: {
      feature_id: packageId
    }
  });
  const validationText = extractText(validation);
  const searchText = extractText(search);
  const readmeText = extractText(readme);
  const summaryText = extractText(summary);

  assertCondition(tools.tools.length >= 9, `Expected at least 9 tools, got ${tools.tools.length}.`);
  assertCondition(
    resources.resources.length >= 5,
    `Expected at least 5 resources, got ${resources.resources.length}.`
  );
  assertCondition(validation.isError !== true, 'Feature package validation returned an error.');
  assertCondition(
    validationText?.includes(`Package: docs/ai-pdlc/features/${packageId}`) === true,
    'Validation output did not mention the expected feature package.'
  );
  assertCondition(
    validationText?.includes('required: missing') !== true,
    'Validation output reported missing required feature package files.'
  );
  assertCondition(
    usingFixture
      ? searchText?.includes('AI-PDLC fixture') === true
      : searchText?.includes('AI-PDLC') === true,
    usingFixture
      ? 'Search output did not include the expected fixture text.'
      : 'Search output did not include the expected generic AI-PDLC text.'
  );
  assertCondition(
    usingFixture
      ? readmeText?.includes('AI-PDLC Fixture Repository') === true
      : readmeText?.includes('docs/ai-pdlc/README.md lines') === true,
    usingFixture
      ? 'README output did not include the expected fixture heading.'
      : 'README output was empty or malformed.'
  );
  assertCondition(summaryText?.includes(packageId) === true, 'Feature summary did not mention the package id.');

  console.log(
    JSON.stringify(
      {
        repo_root: repoRoot,
        package_id: packageId,
        tools: tools.tools.length,
        resources: resources.resources.length,
        validation: validationText,
        search: searchText,
        readme_excerpt: readmeText,
        summary: summaryText
      },
      null,
      2
    )
  );

  await client.close();
}

main().catch(error => {
  console.error('ai-pdlc smoke failed:', error);
  process.exit(1);
});
