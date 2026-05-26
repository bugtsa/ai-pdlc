import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  aiPdlcCliEntryPoint,
  packagedSkillDir
} from './package-paths.mjs';
import { resolveRepoRoot } from './repo-root.mjs';

function findCommandOnPath(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(locator, [command], {
    encoding: 'utf8',
    timeout: 5000
  });

  if (result.status !== 0 || result.error) {
    return null;
  }

  const firstLine = (result.stdout ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);

  return firstLine ?? null;
}

function runCommand(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15000
  });

  const payload = {
    command,
    args,
    status: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    error: result.error?.message ?? null
  };

  if (!allowFailure && (payload.error || payload.status !== 0)) {
    const renderedCommand = [command, ...args].join(' ');
    throw new Error(
      [
        `Command failed: ${renderedCommand}`,
        payload.error,
        payload.stderr,
        payload.stdout
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return payload;
}

function buildLauncherSpec() {
  const installedAlias = findCommandOnPath('ai-pdlc');

  if (installedAlias) {
    return {
      mode: 'path-alias',
      command: 'ai-pdlc',
      args: ['mcp-serve']
    };
  }

  return {
    mode: 'source-absolute',
    command: process.execPath,
    args: [aiPdlcCliEntryPoint, 'mcp-serve']
  };
}

async function installCodexSkill() {
  const destinationDir = path.join(os.homedir(), '.codex', 'skills', 'ai-pdlc');
  await fs.rm(destinationDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destinationDir), { recursive: true });
  await fs.cp(packagedSkillDir, destinationDir, {
    force: true,
    recursive: true
  });

  return destinationDir;
}

async function removeCodexSkill() {
  const destinationDir = path.join(os.homedir(), '.codex', 'skills', 'ai-pdlc');
  await fs.rm(destinationDir, { recursive: true, force: true });
  return destinationDir;
}

function buildCodexCommands(repoRoot, launcher) {
  const envPair = `AI_PDLC_REPO_ROOT=${repoRoot}`;

  return {
    remove: {
      command: 'codex',
      args: ['mcp', 'remove', 'ai_pdlc']
    },
    add: {
      command: 'codex',
      args: ['mcp', 'add', 'ai_pdlc', '--env', envPair, '--', launcher.command, ...launcher.args]
    }
  };
}

function buildClaudeCommands(repoRoot, launcher) {
  const envPair = `AI_PDLC_REPO_ROOT=${repoRoot}`;

  return {
    remove: {
      command: 'claude',
      args: ['mcp', 'remove', '--scope', 'user', 'ai-pdlc']
    },
    add: {
      command: 'claude',
      args: [
        'mcp',
        'add',
        '--scope',
        'user',
        '-e',
        envPair,
        'ai-pdlc',
        '--',
        launcher.command,
        ...launcher.args
      ]
    }
  };
}

function formatCommand(commandSpec) {
  return [commandSpec.command, ...commandSpec.args].join(' ');
}

export async function setupCodex({
  explicitRepoRoot,
  dryRun = false
} = {}) {
  const resolution = await resolveRepoRoot({
    explicitRepoRoot
  });
  const launcher = buildLauncherSpec();
  const commands = buildCodexCommands(resolution.repoRoot, launcher);
  const plannedSkillDestination = path.join(os.homedir(), '.codex', 'skills', 'ai-pdlc');

  if (dryRun) {
    return {
      client: 'codex',
      dry_run: true,
      repo_root: resolution.repoRoot,
      launcher,
      skill_copy: {
        from: packagedSkillDir,
        to: plannedSkillDestination
      },
      commands: {
        remove: formatCommand(commands.remove),
        add: formatCommand(commands.add)
      }
    };
  }

  const installedSkillDir = await installCodexSkill();
  const removeResult = runCommand(commands.remove.command, commands.remove.args, {
    allowFailure: true
  });
  const addResult = runCommand(commands.add.command, commands.add.args);

  return {
    client: 'codex',
    dry_run: false,
    repo_root: resolution.repoRoot,
    launcher,
    skill_install_dir: installedSkillDir,
    remove_result: removeResult,
    add_result: addResult
  };
}

export async function setupClaudeCode({
  explicitRepoRoot,
  dryRun = false
} = {}) {
  const resolution = await resolveRepoRoot({
    explicitRepoRoot
  });
  const launcher = buildLauncherSpec();
  const commands = buildClaudeCommands(resolution.repoRoot, launcher);

  if (dryRun) {
    return {
      client: 'claude-code',
      dry_run: true,
      repo_root: resolution.repoRoot,
      launcher,
      commands: {
        remove: formatCommand(commands.remove),
        add: formatCommand(commands.add)
      }
    };
  }

  const removeResult = runCommand(commands.remove.command, commands.remove.args, {
    allowFailure: true
  });
  const addResult = runCommand(commands.add.command, commands.add.args);

  return {
    client: 'claude-code',
    dry_run: false,
    repo_root: resolution.repoRoot,
    launcher,
    remove_result: removeResult,
    add_result: addResult
  };
}

export async function removeCodex({
  dryRun = false
} = {}) {
  const command = {
    command: 'codex',
    args: ['mcp', 'remove', 'ai_pdlc']
  };
  const skillDir = path.join(os.homedir(), '.codex', 'skills', 'ai-pdlc');

  if (dryRun) {
    return {
      client: 'codex',
      action: 'remove',
      dry_run: true,
      skill_remove_dir: skillDir,
      commands: {
        remove: formatCommand(command)
      }
    };
  }

  const removedSkillDir = await removeCodexSkill();
  const removeResult = runCommand(command.command, command.args, {
    allowFailure: true
  });

  return {
    client: 'codex',
    action: 'remove',
    dry_run: false,
    removed_skill_dir: removedSkillDir,
    remove_result: removeResult
  };
}

export async function removeClaudeCode({
  dryRun = false
} = {}) {
  const command = {
    command: 'claude',
    args: ['mcp', 'remove', '--scope', 'user', 'ai-pdlc']
  };

  if (dryRun) {
    return {
      client: 'claude-code',
      action: 'remove',
      dry_run: true,
      commands: {
        remove: formatCommand(command)
      }
    };
  }

  const removeResult = runCommand(command.command, command.args, {
    allowFailure: true
  });

  return {
    client: 'claude-code',
    action: 'remove',
    dry_run: false,
    remove_result: removeResult
  };
}

export function formatSetupResult(result) {
  const lines = [
    `client: ${result.client}`,
    `action: ${result.action ?? 'setup'}`,
    `dry_run: ${result.dry_run ? 'yes' : 'no'}`,
  ];

  if (result.repo_root) {
    lines.push(`repo_root: ${result.repo_root}`);
  }
  if (result.launcher) {
    lines.push(`launcher_mode: ${result.launcher.mode}`);
  }

  if (result.skill_copy) {
    lines.push(`skill_copy_from: ${result.skill_copy.from}`);
    lines.push(`skill_copy_to: ${result.skill_copy.to}`);
  }

  if (result.skill_install_dir) {
    lines.push(`skill_install_dir: ${result.skill_install_dir}`);
  }
  if (result.skill_remove_dir) {
    lines.push(`skill_remove_dir: ${result.skill_remove_dir}`);
  }
  if (result.removed_skill_dir) {
    lines.push(`removed_skill_dir: ${result.removed_skill_dir}`);
  }

  if (result.commands) {
    lines.push(`remove_command: ${result.commands.remove}`);
    if (result.commands.add) {
      lines.push(`add_command: ${result.commands.add}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
