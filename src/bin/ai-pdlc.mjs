#!/usr/bin/env node

import { promises as fs } from 'node:fs';

import { buildDoctorReport, formatDoctorReport } from '../core/doctor.mjs';
import { claudeDesktopManifestPath } from '../core/package-paths.mjs';
import {
  formatSetupResult,
  removeClaudeCode,
  removeCodex,
  setupClaudeCode,
  setupCodex
} from '../core/setup.mjs';
import { runMcpCli } from '../index.mjs';

function parseArgs(argv) {
  const parsed = {
    positionals: [],
    options: {
      dryRun: false,
      help: false,
      json: false,
      repoRoot: null
    }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      parsed.options.dryRun = true;
      continue;
    }
    if (arg === '--json') {
      parsed.options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.options.help = true;
      continue;
    }
    if (arg === '--repo-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --repo-root.');
      }
      parsed.options.repoRoot = value;
      index += 1;
      continue;
    }

    parsed.positionals.push(arg);
  }

  return parsed;
}

function helpText() {
  return [
    'Usage: ai-pdlc <command> [options]',
    '',
    'Commands:',
    '  doctor                          Validate repo-root resolution and client registrations.',
    '  setup-codex                     Install the bundled skill and register the MCP server in Codex.',
    '  remove-codex                    Remove the Codex MCP registration and bundled skill.',
    '  setup-claude-code               Register the MCP server in Claude Code.',
    '  remove-claude-code              Remove the Claude Code MCP registration.',
    '  mcp-serve                       Start the AI-PDLC MCP server over stdio.',
    '  print-claude-desktop-manifest   Print the bundled Claude Desktop manifest.',
    '  help                            Show this help.',
    '',
    'Shared options:',
    '  --repo-root <path>              Explicit target repository root.',
    '  --dry-run                       Preview setup commands without mutating the user profile.',
    '  --json                          Print machine-readable JSON for supported commands.'
  ].join('\n');
}

async function printManifest(stdout) {
  const manifestText = await fs.readFile(claudeDesktopManifestPath, 'utf8');
  stdout.write(manifestText);
  if (!manifestText.endsWith('\n')) {
    stdout.write('\n');
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const [command = 'help'] = parsed.positionals;
  const stdout = process.stdout;

  if (parsed.options.help || command === 'help') {
    stdout.write(`${helpText()}\n`);
    return;
  }

  if (command === 'doctor') {
    const report = await buildDoctorReport({
      explicitRepoRoot: parsed.options.repoRoot ?? undefined
    });
    stdout.write(
      parsed.options.json
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatDoctorReport(report)
    );
    return;
  }

  if (command === 'setup-codex') {
    const result = await setupCodex({
      explicitRepoRoot: parsed.options.repoRoot ?? undefined,
      dryRun: parsed.options.dryRun
    });
    stdout.write(
      parsed.options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatSetupResult(result)
    );
    return;
  }

  if (command === 'setup-claude-code') {
    const result = await setupClaudeCode({
      explicitRepoRoot: parsed.options.repoRoot ?? undefined,
      dryRun: parsed.options.dryRun
    });
    stdout.write(
      parsed.options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatSetupResult(result)
    );
    return;
  }

  if (command === 'remove-codex') {
    const result = await removeCodex({
      dryRun: parsed.options.dryRun
    });
    stdout.write(
      parsed.options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatSetupResult(result)
    );
    return;
  }

  if (command === 'remove-claude-code') {
    const result = await removeClaudeCode({
      dryRun: parsed.options.dryRun
    });
    stdout.write(
      parsed.options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatSetupResult(result)
    );
    return;
  }

  if (command === 'mcp-serve') {
    await runMcpCli(process.argv.slice(3));
    return;
  }

  if (command === 'print-claude-desktop-manifest') {
    await printManifest(stdout);
    return;
  }

  throw new Error(`Unknown ai-pdlc command "${command}".`);
}

main().catch(error => {
  console.error('ai-pdlc failed:', error);
  process.exit(1);
});
