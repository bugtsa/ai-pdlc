import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  aiPdlcCliEntryPoint,
  claudeDesktopManifestPath,
  mcpCliEntryPoint,
  packageRoot
} from './package-paths.mjs';
import { resolveRepoRoot } from './repo-root.mjs';

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 10000
  });

  return {
    command,
    args,
    status: result.status,
    ok: result.status === 0 && !result.error,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    error: result.error?.message ?? null
  };
}

async function exists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(absolutePath) {
  try {
    return await fs.readFile(absolutePath, 'utf8');
  } catch {
    return null;
  }
}

async function readJsonIfExists(absolutePath) {
  const text = await readTextIfExists(absolutePath);
  if (text === null) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { __parse_error__: true };
  }
}

export async function buildDoctorReport({ explicitRepoRoot } = {}) {
  const resolution = await resolveRepoRoot({
    explicitRepoRoot
  });
  const codexSkillPath = path.join(os.homedir(), '.codex', 'skills', 'ai-pdlc', 'SKILL.md');
  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
  const claudeCodeConfigPath = path.join(os.homedir(), '.claude.json');
  const claudeDesktopConfigPath = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json'
  );
  const codexConfigText = await readTextIfExists(codexConfigPath);
  const claudeCodeConfig = await readJsonIfExists(claudeCodeConfigPath);
  const claudeDesktopConfig = await readJsonIfExists(claudeDesktopConfigPath);

  const report = {
    package: {
      package_root: packageRoot,
      cli_entrypoint: aiPdlcCliEntryPoint,
      mcp_entrypoint: mcpCliEntryPoint,
      claude_desktop_manifest: claudeDesktopManifestPath
    },
    repo_root: {
      path: resolution.repoRoot,
      source: resolution.source,
      valid: resolution.inspection.valid,
      required: resolution.inspection.required.map(marker => ({
        path: marker.relativePath,
        present: marker.exists
      })),
      recommended: resolution.inspection.recommended.map(marker => ({
        path: marker.relativePath,
        present: marker.exists
      }))
    },
    codex_skill: {
      installed: await exists(codexSkillPath),
      path: codexSkillPath
    },
    commands: {},
    registrations: {}
  };

  const codexVersion = runCommand('codex', ['--version']);
  report.commands.codex = {
    available: codexVersion.error === null,
    probe: codexVersion
  };
  report.registrations.codex = {
    configured:
      codexConfigText !== null &&
      /^\[mcp_servers\.ai_pdlc\]$/m.test(codexConfigText),
    config_path: codexConfigPath,
    config_present: codexConfigText !== null
  };

  const claudeVersion = runCommand('claude', ['--version']);
  report.commands.claude = {
    available: claudeVersion.error === null,
    probe: claudeVersion
  };
  report.registrations.claude_code = {
    configured:
      claudeCodeConfig !== null &&
      claudeCodeConfig.__parse_error__ !== true &&
      Object.prototype.hasOwnProperty.call(claudeCodeConfig.mcpServers ?? {}, 'ai-pdlc'),
    config_path: claudeCodeConfigPath,
    config_present: claudeCodeConfig !== null,
    parse_error: claudeCodeConfig?.__parse_error__ === true
  };
  report.registrations.claude_desktop = {
    configured:
      claudeDesktopConfig !== null &&
      claudeDesktopConfig.__parse_error__ !== true &&
      Object.prototype.hasOwnProperty.call(claudeDesktopConfig.mcpServers ?? {}, 'ai-pdlc'),
    config_path: claudeDesktopConfigPath,
    config_present: claudeDesktopConfig !== null,
    parse_error: claudeDesktopConfig?.__parse_error__ === true
  };

  return report;
}

export function formatDoctorReport(report) {
  const lines = [
    '# AI-PDLC doctor',
    '',
    `repo_root: ${report.repo_root.path} (${report.repo_root.source})`,
    `package_root: ${report.package.package_root}`,
    `codex_skill_installed: ${report.codex_skill.installed ? 'yes' : 'no'}`
  ];

  lines.push('');
  lines.push('## Repo markers');
  for (const marker of report.repo_root.required) {
    lines.push(`- required ${marker.path}: ${marker.present ? 'present' : 'missing'}`);
  }
  for (const marker of report.repo_root.recommended) {
    lines.push(`- recommended ${marker.path}: ${marker.present ? 'present' : 'missing'}`);
  }

  lines.push('');
  lines.push('## Commands');
  lines.push(`- codex: ${report.commands.codex.available ? 'available' : 'missing'}`);
  lines.push(`- claude: ${report.commands.claude.available ? 'available' : 'missing'}`);

  lines.push('');
  lines.push(`codex registration: ${report.registrations.codex.configured ? 'configured' : 'missing'}`);
  lines.push(`claude code registration: ${report.registrations.claude_code.configured ? 'configured' : 'missing'}`);
  lines.push(`claude desktop registration: ${report.registrations.claude_desktop.configured ? 'configured' : 'missing'}`);

  return `${lines.join('\n')}\n`;
}
