#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
const distDir = path.join(packageRoot, 'dist');
const stageRoot = path.join(distDir, 'windows-portable');
const stageDir = path.join(stageRoot, 'ai-pdlc');
const packageJsonPath = path.join(packageRoot, 'package.json');
const packageLockPath = path.join(packageRoot, 'package-lock.json');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0 || result.error) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        result.error?.message,
        result.stderr?.trim(),
        result.stdout?.trim()
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return result.stdout?.trim() ?? '';
}

function buildCmdLauncher(targetScript) {
  return [
    '@echo off',
    'setlocal',
    'set SCRIPT_DIR=%~dp0',
    `node "%SCRIPT_DIR%..\\${targetScript}" %*`
  ].join('\r\n');
}

async function stagePortableBundle() {
  await fs.rm(stageRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(stageDir, 'bin'), { recursive: true });

  await fs.cp(path.join(packageRoot, 'src'), path.join(stageDir, 'src'), { recursive: true });
  await fs.cp(path.join(packageRoot, 'skills'), path.join(stageDir, 'skills'), { recursive: true });
  await fs.cp(path.join(packageRoot, 'claude-desktop'), path.join(stageDir, 'claude-desktop'), {
    recursive: true
  });
  await fs.copyFile(packageJsonPath, path.join(stageDir, 'package.json'));
  await fs.copyFile(packageLockPath, path.join(stageDir, 'package-lock.json'));
  await fs.copyFile(path.join(packageRoot, 'README.md'), path.join(stageDir, 'README.md'));

  await fs.writeFile(
    path.join(stageDir, 'bin', 'ai-pdlc.cmd'),
    `${buildCmdLauncher('src\\bin\\ai-pdlc.mjs')}\r\n`
  );
  await fs.writeFile(
    path.join(stageDir, 'bin', 'ai-pdlc-mcp.cmd'),
    `${buildCmdLauncher('src\\bin\\ai-pdlc-mcp.mjs')}\r\n`
  );

  run('npm', ['ci', '--omit=dev'], { cwd: stageDir });
}

async function main() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  const outputPath = path.join(distDir, `ai-pdlc-${version}-windows-portable.zip`);

  await fs.mkdir(distDir, { recursive: true });
  await stagePortableBundle();
  await fs.rm(outputPath, { force: true });
  run('zip', ['-qr', outputPath, '.'], { cwd: stageDir });
  await fs.rm(stageRoot, { recursive: true, force: true });
  console.log(outputPath);
}

main().catch(error => {
  console.error('build-windows-portable failed:', error.message);
  process.exit(1);
});
