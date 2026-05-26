import { promises as fs } from 'node:fs';
import path from 'node:path';

const REQUIRED_MARKERS = [
  {
    kind: 'file',
    relativePath: 'docs/ai-pdlc/README.md',
    required: true
  }
];

const RECOMMENDED_MARKERS = [
  {
    kind: 'directory',
    relativePath: 'docs/ai-pdlc/features',
    required: false
  },
  {
    kind: 'directory',
    relativePath: 'docs/ai-pdlc/templates',
    required: false
  },
  {
    kind: 'directory',
    relativePath: 'docs/current-tasks',
    required: false
  },
  {
    kind: 'file',
    relativePath: 'web/AI-PDLC.md',
    required: false
  }
];

async function safeStat(absolutePath) {
  try {
    return await fs.stat(absolutePath);
  } catch {
    return null;
  }
}

async function inspectMarker(rootPath, marker) {
  const absolutePath = path.join(rootPath, marker.relativePath);
  const stat = await safeStat(absolutePath);
  const exists =
    marker.kind === 'file'
      ? stat?.isFile() === true
      : stat?.isDirectory() === true;

  return {
    ...marker,
    absolutePath,
    exists
  };
}

export async function inspectRepoRoot(candidateRoot) {
  const normalizedRoot = path.resolve(candidateRoot);
  const required = await Promise.all(
    REQUIRED_MARKERS.map(marker => inspectMarker(normalizedRoot, marker))
  );
  const recommended = await Promise.all(
    RECOMMENDED_MARKERS.map(marker => inspectMarker(normalizedRoot, marker))
  );
  const requiredMissing = required.filter(marker => !marker.exists);

  return {
    repoRoot: normalizedRoot,
    valid: requiredMissing.length === 0,
    required,
    recommended,
    requiredMissing
  };
}

export async function findRepoRootFromCwd(cwd = process.cwd()) {
  let current = path.resolve(cwd);

  while (true) {
    const inspection = await inspectRepoRoot(current);
    if (inspection.valid) {
      return inspection;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function resolveRepoRoot({
  explicitRepoRoot,
  envRepoRoot = process.env.AI_PDLC_REPO_ROOT,
  cwd = process.cwd()
} = {}) {
  if (explicitRepoRoot) {
    const inspection = await inspectRepoRoot(explicitRepoRoot);
    if (!inspection.valid) {
      throw new Error(formatRepoRootError('flag', inspection));
    }
    return {
      repoRoot: inspection.repoRoot,
      source: 'flag',
      inspection
    };
  }

  if (envRepoRoot) {
    const inspection = await inspectRepoRoot(envRepoRoot);
    if (!inspection.valid) {
      throw new Error(formatRepoRootError('env', inspection));
    }
    return {
      repoRoot: inspection.repoRoot,
      source: 'env',
      inspection
    };
  }

  const discovered = await findRepoRootFromCwd(cwd);
  if (discovered) {
    return {
      repoRoot: discovered.repoRoot,
      source: 'cwd',
      inspection: discovered
    };
  }

  throw new Error(
    [
      'Could not resolve the AI-PDLC repository root.',
      'Pass --repo-root <path>, set AI_PDLC_REPO_ROOT, or run the command from inside a repository that contains docs/ai-pdlc/README.md.'
    ].join(' ')
  );
}

export function formatRepoRootInspection(inspection) {
  const lines = [
    `repo_root=${inspection.repoRoot}`,
    `valid=${inspection.valid ? 'yes' : 'no'}`
  ];

  for (const marker of [...inspection.required, ...inspection.recommended]) {
    lines.push(
      `${marker.required ? 'required' : 'recommended'} ${marker.kind} ${marker.relativePath} -> ${marker.exists ? 'present' : 'missing'}`
    );
  }

  return lines.join('\n');
}

function formatRepoRootError(source, inspection) {
  const missing = inspection.requiredMissing.map(marker => marker.relativePath).join(', ');
  return [
    `Resolved AI-PDLC repo root from ${source}, but the target is invalid: ${inspection.repoRoot}.`,
    `Missing required markers: ${missing}.`
  ].join(' ');
}
