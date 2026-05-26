#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function parseArgs(argv) {
  let repoRoot = process.env.AI_PDLC_REPO_ROOT ?? null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-root') {
      repoRoot = argv[index + 1] ?? null;
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

  return { repoRoot };
}

function printHelp() {
  console.log('Usage: node scripts/dev/smoke.mjs --repo-root <path>');
}

async function main() {
  const { repoRoot } = parseArgs(process.argv.slice(2));
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
      package_id: 'aipdlc_cross_client_packaging'
    }
  });

  console.log(
    JSON.stringify(
      {
        repo_root: repoRoot,
        tools: tools.tools.length,
        resources: resources.resources.length,
        validation: validation.content?.[0]?.text ?? null
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
