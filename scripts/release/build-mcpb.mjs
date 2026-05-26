#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
const distDir = path.join(packageRoot, 'dist');
const stageDir = path.join(distDir, 'claude-desktop-bundle');
const manifestSourcePath = path.join(packageRoot, 'claude-desktop', 'manifest.json');
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

function npxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

async function stageBundle(version) {
  await fs.rm(stageDir, { recursive: true, force: true });
  await fs.mkdir(stageDir, { recursive: true });
  await fs.cp(path.join(packageRoot, 'src'), path.join(stageDir, 'src'), { recursive: true });
  await fs.copyFile(packageJsonPath, path.join(stageDir, 'package.json'));
  await fs.copyFile(packageLockPath, path.join(stageDir, 'package-lock.json'));

  const manifest = JSON.parse(await fs.readFile(manifestSourcePath, 'utf8'));
  manifest.version = version;
  await fs.writeFile(path.join(stageDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  run('npm', ['ci', '--omit=dev'], { cwd: stageDir });
  run(npxCommand(), ['--no-install', 'mcpb', 'validate', path.join(stageDir, 'manifest.json')]);
}

async function main() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  const outputPath = path.join(distDir, `ai-pdlc-${version}.mcpb`);

  await fs.mkdir(distDir, { recursive: true });
  await stageBundle(version);
  await fs.rm(outputPath, { force: true });
  run(npxCommand(), ['--no-install', 'mcpb', 'pack', stageDir, outputPath]);
  await fs.rm(stageDir, { recursive: true, force: true });
  console.log(outputPath);
}

main().catch(error => {
  console.error('build-mcpb failed:', error.message);
  process.exit(1);
});
