import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import { resolveRepoRoot } from './core/repo-root.mjs';

let repoRoot = null;
let ALLOWED_READ_ROOTS = [];

const TEXT_EXTENSIONS = new Set(['.md', '.json', '.txt', '.yaml', '.yml']);
const MAX_RESULTS_LIMIT = 20;
const DEFAULT_RESULTS_LIMIT = 8;
const DEFAULT_READ_MAX_CHARS = 12000;
const DEFAULT_READ_LINE_WINDOW = 200;

const SEARCH_SCOPES = {
  all: [
    'docs/ai-pdlc',
    'docs/current-tasks',
    'web/AI-PDLC.md'
  ],
  knowledge_base: [
    'docs/ai-pdlc/README.md',
    'docs/ai-pdlc/rag_ready_knowledge.md',
    'docs/ai-pdlc/patterns'
  ],
  features: ['docs/ai-pdlc/features'],
  runbooks: ['docs/ai-pdlc/runbooks'],
  prompts: ['docs/ai-pdlc/prompts'],
  templates: ['docs/ai-pdlc/templates'],
  current_tasks: ['docs/current-tasks'],
  web: ['web/AI-PDLC.md']
};

const LEGACY_ASSET_CATEGORIES = {
  all: ['docs/ai-pdlc', 'docs/current-tasks', 'web/AI-PDLC.md'],
  overview: ['docs/ai-pdlc/README.md', 'docs/ai-pdlc/rag_ready_knowledge.md'],
  knowledge: ['docs/ai-pdlc/README.md', 'docs/ai-pdlc/rag_ready_knowledge.md'],
  web: ['web/AI-PDLC.md'],
  patterns: ['docs/ai-pdlc/patterns'],
  prompts: ['docs/ai-pdlc/prompts'],
  templates: ['docs/ai-pdlc/templates'],
  features: ['docs/ai-pdlc/features'],
  runbooks: ['docs/ai-pdlc/runbooks']
};

function configureRepoRoot(nextRepoRoot) {
  repoRoot = path.resolve(nextRepoRoot);
  ALLOWED_READ_ROOTS = [
    'docs/ai-pdlc',
    'docs/current-tasks',
    'web/AI-PDLC.md'
  ].map(relativePath => path.resolve(repoRoot, relativePath));
}

const STATIC_RESOURCES = [
  {
    name: 'aipdlc-readme',
    uri: 'aipdlc://readme',
    title: 'AI-PDLC README',
    description: 'Core AI-PDLC workflow overview',
    relativePath: 'docs/ai-pdlc/README.md'
  },
  {
    name: 'aipdlc-knowledge-base',
    uri: 'aipdlc://knowledge-base',
    title: 'AI-PDLC Knowledge Base',
    description: 'RAG-ready AI-PDLC rules and contracts',
    relativePath: 'docs/ai-pdlc/rag_ready_knowledge.md'
  },
  {
    name: 'aipdlc-patterns-index',
    uri: 'aipdlc://patterns',
    title: 'AI-PDLC Patterns Index',
    description: 'Index of AI-PDLC reusable patterns',
    relativePath: 'docs/ai-pdlc/patterns/README.md'
  }
];

const TEMPLATE_DOCS = {
  readme: 'docs/ai-pdlc/README.md',
  knowledge_base: 'docs/ai-pdlc/rag_ready_knowledge.md',
  patterns: 'docs/ai-pdlc/patterns/README.md',
  prompts: 'docs/ai-pdlc/prompts/02_executor.md',
  templates: 'docs/ai-pdlc/templates/task_spec.json'
};

const server = new McpServer({
  name: 'ai-pdlc',
  version: '0.1.0'
});

for (const resource of STATIC_RESOURCES) {
  server.registerResource(
    resource.name,
    resource.uri,
    {
      title: resource.title,
      description: resource.description,
      mimeType: 'text/markdown'
    },
    async () => ({
      contents: [
        {
          uri: resource.uri,
          mimeType: 'text/markdown',
          text: await readRepoDoc(resource.relativePath)
        }
      ]
    })
  );
}

server.registerResource(
  'aipdlc-doc-template',
  new ResourceTemplate('aipdlc://doc/{doc}', {
    list: undefined,
    complete: {
      doc: value =>
        Object.keys(TEMPLATE_DOCS).filter(candidate => candidate.startsWith(value.toLowerCase()))
    }
  }),
  {
    title: 'AI-PDLC doc by id',
    description: 'Read a canonical AI-PDLC doc by short id.',
    mimeType: 'text/markdown'
  },
  async (uri, variables) => {
    const docId = String(variables.doc ?? '').toLowerCase();
    const relativePath = TEMPLATE_DOCS[docId];

    if (!relativePath) {
      throw new Error(
        `Unknown AI-PDLC doc id "${docId}". Known ids: ${Object.keys(TEMPLATE_DOCS).join(', ')}`
      );
    }

    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: 'text/markdown',
          text: await readRepoDoc(relativePath)
        }
      ]
    };
  }
);

server.registerResource(
  'aipdlc-catalog',
  'aipdlc://catalog',
  {
    title: 'AI-PDLC catalog',
    description: 'Top-level catalog of AI-PDLC docs, templates, prompts, runbooks, and feature packages.',
    mimeType: 'text/markdown'
  },
  async () => ({
    contents: [
      {
        uri: 'aipdlc://catalog',
        mimeType: 'text/markdown',
        text: await buildCatalogMarkdown()
      }
    ]
  })
);

server.registerResource(
  'aipdlc-features-index',
  'aipdlc://features/index',
  {
    title: 'AI-PDLC feature index',
    description: 'Feature package directories under docs/ai-pdlc/features.',
    mimeType: 'text/markdown'
  },
  async () => ({
    contents: [
      {
        uri: 'aipdlc://features/index',
        mimeType: 'text/markdown',
        text: await buildFeaturesIndexMarkdown()
      }
    ]
  })
);

server.registerTool(
  'aipdlc_search_docs',
  {
    description: 'Search AI-PDLC docs, feature packages, runbooks, prompts, and current-task notes in this repo.',
    inputSchema: {
      query: z.string().min(1).describe('Search query, phrase, or set of terms.'),
      scope: z
        .enum(Object.keys(SEARCH_SCOPES))
        .optional()
        .describe('Search scope. Defaults to all.'),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(MAX_RESULTS_LIMIT)
        .optional()
        .describe(`Maximum number of matches to return. Defaults to ${DEFAULT_RESULTS_LIMIT}.`)
    }
  },
  async ({ query, scope, max_results }) => {
    try {
      const normalizedScope = scope ?? 'all';
      const normalizedLimit = max_results ?? DEFAULT_RESULTS_LIMIT;
      const files = await collectScopeFiles(normalizedScope);
      const matches = await searchFiles(files, query, normalizedLimit);

      if (matches.length === 0) {
        return textResult(
          `No AI-PDLC matches found for "${query}" in scope "${normalizedScope}".`
        );
      }

      const header = `Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query}" in scope "${normalizedScope}":`;
      const body = matches
        .map(match => {
          const linePart = match.lineNumber > 0 ? `:${match.lineNumber}` : '';
          return `[${match.relativePath}${linePart}] score=${match.score}\n${indent(match.preview)}`;
        })
        .join('\n\n');

      return textResult(`${header}\n\n${body}`);
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

server.registerTool(
  'aipdlc_read_doc',
  {
    description: 'Read a specific AI-PDLC or current-task doc from the repo, with optional line range.',
    inputSchema: {
      path: z
        .string()
        .min(1)
        .describe('Repo-relative path, basename, or suffix of the document to read.'),
      start_line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based start line. Defaults to 1.'),
      end_line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(`1-based end line. Defaults to start_line + ${DEFAULT_READ_LINE_WINDOW - 1}.`),
      max_chars: z
        .number()
        .int()
        .min(500)
        .max(40000)
        .optional()
        .describe(`Maximum characters to return. Defaults to ${DEFAULT_READ_MAX_CHARS}.`)
    }
  },
  async ({ path: requestedPath, start_line, end_line, max_chars }) => {
    try {
      const resolvedPath = await resolveReadablePath(requestedPath);
      const content = await fs.readFile(resolvedPath, 'utf8');
      const lines = content.split(/\r?\n/);

      const startLine = start_line ?? 1;
      const effectiveEndLine =
        end_line ?? Math.min(lines.length, startLine + DEFAULT_READ_LINE_WINDOW - 1);
      const clampedEndLine = Math.min(lines.length, effectiveEndLine);

      if (startLine > lines.length) {
        return errorResult(
          `${toRepoRelative(resolvedPath)} has only ${lines.length} lines; start_line=${startLine} is out of range.`
        );
      }
      if (clampedEndLine < startLine) {
        return errorResult(
          `${toRepoRelative(resolvedPath)} received an invalid range: start_line=${startLine}, end_line=${effectiveEndLine}.`
        );
      }

      const excerpt = lines
        .slice(startLine - 1, clampedEndLine)
        .map((line, index) => `${String(startLine + index).padStart(4, ' ')} | ${line}`)
        .join('\n');

      const limitedExcerpt = truncateText(excerpt, max_chars ?? DEFAULT_READ_MAX_CHARS);
      const summary = `${toRepoRelative(resolvedPath)} lines ${startLine}-${clampedEndLine}\n\n${limitedExcerpt}`;

      return textResult(summary);
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

server.registerTool(
  'aipdlc_validate_feature_package',
  {
    description: 'Validate the basic structure of an AI-PDLC feature package under docs/ai-pdlc/features.',
    inputSchema: {
      package_id: z
        .string()
        .min(1)
        .describe('Feature package id, directory name, or repo-relative package path.')
    }
  },
  async ({ package_id }) => {
    try {
      const packageDir = await resolveFeaturePackageDir(package_id);
      const packagePath = toRepoRelative(packageDir);
      const requiredGroups = [
        ['task_spec.json', 'task_spec.md'],
        ['implementation_backlog.md']
      ];
      const recommendedFiles = ['architecture_intent.md', 'human_feedback_sync.md'];

      const messages = [`Package: ${packagePath}`];
      let hasBlockingIssue = false;

      for (const group of requiredGroups) {
        const present = await findFirstExisting(packageDir, group);
        if (present) {
          messages.push(`required: ok -> ${path.join(packagePath, present)}`);
        } else {
          hasBlockingIssue = true;
          messages.push(`required: missing -> one of ${group.map(name => path.join(packagePath, name)).join(', ')}`);
        }
      }

      for (const filename of recommendedFiles) {
        const exists = await pathExists(path.join(packageDir, filename));
        messages.push(
          `${exists ? 'recommended: ok' : 'recommended: missing'} -> ${path.join(packagePath, filename)}`
        );
      }

      const taskSpecJsonPath = path.join(packageDir, 'task_spec.json');
      if (await pathExists(taskSpecJsonPath)) {
        const validation = await validateTaskSpecJson(taskSpecJsonPath);
        messages.push(...validation.messages);
        hasBlockingIssue ||= validation.hasBlockingIssue;
      }

      return {
        content: [{ type: 'text', text: messages.join('\n') }],
        isError: hasBlockingIssue
      };
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

server.registerTool(
  'list_process_assets',
  {
    description: 'List AI-PDLC docs, prompts, templates, runbooks, and feature packages available in this repo.',
    inputSchema: {
      category: z
        .enum(Object.keys(LEGACY_ASSET_CATEGORIES))
        .optional()
        .describe('Optional category filter. Defaults to all.'),
      include_paths: z.boolean().optional().describe('Include repo-relative paths and MCP resource URIs.')
    }
  },
  async ({ category, include_paths }) => {
    try {
      const categoriesCatalog = await buildCatalog();
      const selectedCategory = category ?? 'all';
      const categories =
        selectedCategory === 'all'
          ? categoriesCatalog
          : categoriesCatalog.filter(item => item.category === selectedCategory);
      const payload = {
        repo_root: repoRoot,
        docs_root: path.resolve(repoRoot, 'docs/ai-pdlc'),
        categories: categories.map(item => ({
          category: item.category,
          count: item.items.length,
          items: item.items.map(entry =>
            include_paths === false
              ? { name: entry.name }
              : {
                  name: entry.name,
                  repo_rel_path: entry.repoRelPath,
                  uri: entry.uri
                }
          )
        })),
        feature_ids: await listFeatureIds(),
        runbook_names: await listRunbookNames()
      };

      return textResult(JSON.stringify(payload, null, 2), payload);
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

server.registerTool(
  'search_process_docs',
  {
    description: 'Search AI-PDLC docs and return matching lines with repo-relative file references.',
    inputSchema: {
      query: z.string().min(1).describe('Case-insensitive search query.'),
      scopes: z
        .array(z.enum(Object.keys(LEGACY_ASSET_CATEGORIES)))
        .optional()
        .describe('Optional legacy scope filter. Defaults to all.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of matches to return.')
    }
  },
  async ({ query, scopes, limit }) => {
    try {
      const selectedScopes = scopes?.length ? scopes : ['all'];
      const files = await collectLegacyScopeFiles(selectedScopes);
      const results = await searchFiles(files, query, limit ?? 12);
      const payload = {
        query,
        scopes: selectedScopes,
        total_matches: results.length,
        results: results.map(item => ({
          repo_rel_path: item.relativePath,
          uri: buildRepoDocUri(item.relativePath),
          line: item.lineNumber,
          excerpt: item.preview
        }))
      };

      return textResult(JSON.stringify(payload, null, 2), payload);
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

server.registerTool(
  'recommend_process_assets',
  {
    description: 'Recommend which AI-PDLC docs and prompts should be loaded for a given task shape and execution stage.',
    inputSchema: {
      stage: z.enum(['intake', 'execution', 'review']).optional(),
      is_new_feature: z.boolean().optional(),
      is_web_task: z.boolean().optional(),
      has_human_feedback: z.boolean().optional(),
      runtime_sensitive: z.boolean().optional(),
      stateful: z.boolean().optional(),
      time_bounded_quota: z.boolean().optional(),
      uses_local_models_or_runtime_assets: z.boolean().optional()
    }
  },
  async args => {
    try {
      const payload = recommendProcessAssets({
        stage: args.stage ?? 'intake',
        isNewFeature: args.is_new_feature ?? false,
        isWebTask: args.is_web_task ?? false,
        hasHumanFeedback: args.has_human_feedback ?? false,
        runtimeSensitive: args.runtime_sensitive ?? false,
        stateful: args.stateful ?? false,
        timeBoundedQuota: args.time_bounded_quota ?? false,
        usesLocalModelsOrRuntimeAssets: args.uses_local_models_or_runtime_assets ?? false
      });

      return textResult(JSON.stringify(payload, null, 2), payload);
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

server.registerTool(
  'get_feature_package_summary',
  {
    description: 'Summarize an AI-PDLC feature package under docs/ai-pdlc/features/<feature_id>.',
    inputSchema: {
      feature_id: z.string().min(1).describe('Feature package directory name.')
    }
  },
  async ({ feature_id }) => {
    try {
      const payload = await summarizeFeaturePackage(feature_id);
      return textResult(JSON.stringify(payload, null, 2), payload);
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

server.registerTool(
  'validate_feature_package',
  {
    description: 'Validate an AI-PDLC feature package and detect missing core artifacts or unresolved template placeholders.',
    inputSchema: {
      feature_id: z.string().min(1).describe('Feature package directory name.')
    }
  },
  async ({ feature_id }) => {
    try {
      const payload = await validateFeaturePackageDetailed(feature_id);
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: !payload.valid
      };
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

server.registerTool(
  'scaffold_feature_package',
  {
    description: 'Create or refresh a feature package from docs/ai-pdlc/templates.',
    inputSchema: {
      feature_id: z.string().min(1).describe('New feature package directory name.'),
      title: z.string().optional().describe('Optional initial task_spec title.'),
      goal: z.string().optional().describe('Optional initial task_spec goal.'),
      overwrite: z.boolean().optional().describe('Overwrite existing seeded files if true.')
    }
  },
  async ({ feature_id, title, goal, overwrite }) => {
    try {
      const payload = await scaffoldFeaturePackage({
        featureId: feature_id,
        title,
        goal,
        overwrite: overwrite ?? false
      });
      return textResult(JSON.stringify(payload, null, 2), payload);
    } catch (error) {
      return errorResult(error.message);
    }
  }
);

async function collectScopeFiles(scope) {
  const entries = SEARCH_SCOPES[scope];
  if (!entries) {
    throw new Error(`Unknown scope "${scope}". Known scopes: ${Object.keys(SEARCH_SCOPES).join(', ')}`);
  }

  return collectFilesFromEntries(entries);
}

async function collectLegacyScopeFiles(scopes) {
  const combinedEntries = [];
  for (const scope of scopes) {
    const entries = LEGACY_ASSET_CATEGORIES[scope];
    if (!entries) {
      throw new Error(
        `Unknown legacy scope "${scope}". Known scopes: ${Object.keys(LEGACY_ASSET_CATEGORIES).join(', ')}`
      );
    }
    combinedEntries.push(...entries);
  }

  return collectFilesFromEntries(
    combinedEntries.filter((value, index, array) => array.indexOf(value) === index)
  );
}

async function collectFilesFromEntries(entries) {
  const files = [];
  for (const entry of entries) {
    const absoluteEntry = path.resolve(repoRoot, entry);
    const stat = await safeStat(absoluteEntry);
    if (!stat) {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...(await walkTextFiles(absoluteEntry)));
      continue;
    }
    if (stat.isFile()) {
      files.push(absoluteEntry);
    }
  }

  return files.sort();
}

async function listDirectories(relativeRoot) {
  const absoluteRoot = path.resolve(repoRoot, relativeRoot);
  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function listFeatureIds() {
  return listDirectories('docs/ai-pdlc/features');
}

async function listRunbookNames() {
  return listDirectories('docs/ai-pdlc/runbooks');
}

async function walkTextFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === '.DS_Store') {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTextFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function searchFiles(files, query, limit) {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = Array.from(
    new Set(
      normalizedQuery
        .split(/\s+/)
        .map(term => term.trim())
        .filter(Boolean)
    )
  );
  const matches = [];

  for (const file of files) {
    const relativePath = toRepoRelative(file);
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);
    const pathScore = scoreText(relativePath.toLowerCase(), normalizedQuery, terms);
    let addedFileLevelMatch = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineScore = scoreText(line.toLowerCase(), normalizedQuery, terms);

      if (lineScore === 0) {
        if (pathScore > 0 && !addedFileLevelMatch) {
          matches.push({
            relativePath,
            lineNumber: 0,
            score: pathScore,
            preview: '(path match only)'
          });
          addedFileLevelMatch = true;
        }
        continue;
      }

      matches.push({
        relativePath,
        lineNumber: index + 1,
        score: lineScore + pathScore,
        preview: truncateInline(line.trim() || '(blank line)')
      });
    }
  }

  return matches
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.relativePath !== right.relativePath) {
        return left.relativePath.localeCompare(right.relativePath);
      }
      return left.lineNumber - right.lineNumber;
    })
    .slice(0, limit);
}

function scoreText(text, normalizedQuery, terms) {
  if (!text) {
    return 0;
  }

  let score = 0;
  if (text.includes(normalizedQuery)) {
    score += Math.max(terms.length, 1) * 4;
  }

  for (const term of terms) {
    if (text.includes(term)) {
      score += 1;
    }
  }

  return score;
}

async function resolveReadablePath(requestedPath) {
  const directPath = path.resolve(repoRoot, requestedPath);
  if (await isAllowedFile(directPath)) {
    return directPath;
  }

  const allAllowedFiles = await collectScopeFiles('all');
  const normalizedRequestedPath = requestedPath.replace(/\\/g, '/');
  const basename = path.basename(normalizedRequestedPath);

  const exactRelativeMatch = allAllowedFiles.find(file => toRepoRelative(file) === normalizedRequestedPath);
  if (exactRelativeMatch) {
    return exactRelativeMatch;
  }

  const suffixMatches = allAllowedFiles.filter(file => toRepoRelative(file).endsWith(normalizedRequestedPath));
  if (suffixMatches.length === 1) {
    return suffixMatches[0];
  }

  const basenameMatches = allAllowedFiles.filter(file => path.basename(file) === basename);
  if (basenameMatches.length === 1) {
    return basenameMatches[0];
  }

  const candidates = [...suffixMatches, ...basenameMatches]
    .map(file => toRepoRelative(file))
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 10);

  if (candidates.length > 0) {
    throw new Error(
      `Path "${requestedPath}" is ambiguous. Candidates:\n${candidates.map(candidate => `- ${candidate}`).join('\n')}`
    );
  }

  throw new Error(`Could not resolve "${requestedPath}" inside AI-PDLC/current-task docs.`);
}

async function resolveFeaturePackageDir(packageId) {
  const directPath = path.resolve(repoRoot, packageId);
  if (await isAllowedFeatureDirectory(directPath)) {
    return directPath;
  }

  const canonicalPath = path.resolve(repoRoot, 'docs/ai-pdlc/features', packageId);
  if (await isAllowedFeatureDirectory(canonicalPath)) {
    return canonicalPath;
  }

  const featureRoot = path.resolve(repoRoot, 'docs/ai-pdlc/features');
  const entries = await fs.readdir(featureRoot, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isDirectory() && entry.name === path.basename(packageId))
    .map(entry => path.join(featureRoot, entry.name));

  if (candidates.length === 1) {
    return candidates[0];
  }

  throw new Error(`Feature package "${packageId}" was not found under docs/ai-pdlc/features.`);
}

async function isAllowedFeatureDirectory(candidatePath) {
  const stat = await safeStat(candidatePath);
  if (!stat?.isDirectory()) {
    return false;
  }

  const featureRoot = path.resolve(repoRoot, 'docs/ai-pdlc/features');
  return isInside(candidatePath, featureRoot);
}

async function isAllowedFile(candidatePath) {
  const stat = await safeStat(candidatePath);
  if (!stat?.isFile()) {
    return false;
  }

  return ALLOWED_READ_ROOTS.some(root => isInside(candidatePath, root));
}

function isInside(candidatePath, allowedRoot) {
  const normalizedCandidate = path.resolve(candidatePath);
  const normalizedRoot = path.resolve(allowedRoot);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

async function findFirstExisting(directory, filenames) {
  for (const filename of filenames) {
    if (await pathExists(path.join(directory, filename))) {
      return filename;
    }
  }
  return null;
}

async function validateTaskSpecJson(taskSpecJsonPath) {
  const relativePath = toRepoRelative(taskSpecJsonPath);
  const text = await fs.readFile(taskSpecJsonPath, 'utf8');
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      hasBlockingIssue: true,
      messages: [`task_spec.json parse: error -> ${relativePath} (${error.message})`]
    };
  }

  const requiredTopLevelKeys = ['title', 'goal', 'scope'];
  const recommendedTopLevelKeys = ['acceptance_criteria', 'definition_of_done'];
  const messages = [`task_spec.json parse: ok -> ${relativePath}`];
  let hasBlockingIssue = false;

  for (const key of requiredTopLevelKeys) {
    if (parsed[key] === undefined) {
      hasBlockingIssue = true;
      messages.push(`task_spec required key missing -> ${key}`);
    }
  }

  for (const key of recommendedTopLevelKeys) {
    if (parsed[key] === undefined) {
      messages.push(`task_spec recommended key missing -> ${key}`);
    }
  }

  if (parsed.scope && typeof parsed.scope === 'object') {
    if (parsed.scope.in === undefined) {
      messages.push('task_spec scope note -> scope.in missing');
    }
    if (parsed.scope.out === undefined) {
      messages.push('task_spec scope note -> scope.out missing');
    }
  }

  return { hasBlockingIssue, messages };
}

async function buildCatalog() {
  const featureIds = await listFeatureIds();
  const runbookNames = await listRunbookNames();

  const categories = [];

  for (const [category, entries] of Object.entries(LEGACY_ASSET_CATEGORIES)) {
    if (category === 'all') {
      continue;
    }

    if (category === 'features') {
      categories.push({
        category,
        items: featureIds.map(featureId => ({
          name: featureId,
          repoRelPath: `docs/ai-pdlc/features/${featureId}`,
          uri: buildFeatureBundleUri(featureId)
        }))
      });
      continue;
    }

    if (category === 'runbooks') {
      categories.push({
        category,
        items: runbookNames.map(runbookName => ({
          name: runbookName,
          repoRelPath: `docs/ai-pdlc/runbooks/${runbookName}`,
          uri: buildRepoDocUri(`docs/ai-pdlc/runbooks/${runbookName}/README.md`)
        }))
      });
      continue;
    }

    const files = await collectFilesFromEntries(entries);
    categories.push({
      category,
      items: files.map(file => ({
        name: path.basename(file),
        repoRelPath: toRepoRelative(file),
        uri: buildRepoDocUri(toRepoRelative(file))
      }))
    });
  }

  return categories;
}

async function buildCatalogMarkdown() {
  const categories = await buildCatalog();
  const sections = ['# AI-PDLC catalog'];

  for (const category of categories) {
    sections.push(`## ${category.category}`);
    if (category.items.length === 0) {
      sections.push('- (empty)');
      continue;
    }
    sections.push(
      ...category.items.map(item => `- ${item.name}: ${item.repoRelPath} (${item.uri})`)
    );
  }

  return `${sections.join('\n')}\n`;
}

async function buildFeaturesIndexMarkdown() {
  const featureIds = await listFeatureIds();
  const lines = ['# AI-PDLC feature index'];

  for (const featureId of featureIds) {
    lines.push(`- ${featureId}: ${buildFeatureBundleUri(featureId)}`);
  }

  return `${lines.join('\n')}\n`;
}

function buildRepoDocUri(repoRelPath) {
  return `aipdlc://repo/${repoRelPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')}`;
}

function buildFeatureBundleUri(featureId) {
  return `aipdlc://feature/${encodeURIComponent(featureId)}`;
}

function recommendProcessAssets(input) {
  const recommendedPaths = ['docs/ai-pdlc/README.md'];
  const reasons = ['AI-PDLC README is the default process entrypoint.'];

  if (input.stage === 'intake') {
    recommendedPaths.push('docs/ai-pdlc/prompts/01_intake_to_task_spec.md');
    recommendedPaths.push('docs/ai-pdlc/templates/task_spec.json');
    reasons.push('Intake stage needs the task-spec prompt and JSON template.');
  }

  if (input.stage === 'execution') {
    recommendedPaths.push('docs/ai-pdlc/prompts/02_executor.md');
    recommendedPaths.push('docs/ai-pdlc/patterns/feature_development.md');
    recommendedPaths.push('docs/ai-pdlc/patterns/post_work_git_flow.md');
    recommendedPaths.push('docs/ai-pdlc/patterns/testing.md');
    recommendedPaths.push('docs/ai-pdlc/patterns/naming.md');
    recommendedPaths.push('docs/ai-pdlc/patterns/analytics.md');
    recommendedPaths.push('docs/ai-pdlc/patterns/remote_config_flags.md');
    reasons.push('Execution stage needs the executor prompt and mandatory implementation patterns.');
  }

  if (input.stage === 'review') {
    recommendedPaths.push('docs/ai-pdlc/prompts/03_reviewer.md');
    recommendedPaths.push('docs/ai-pdlc/patterns/definition_of_done.md');
    recommendedPaths.push('docs/ai-pdlc/patterns/testing.md');
    reasons.push('Review stage needs the reviewer prompt and done/testing checks.');
  }

  if (input.isNewFeature) {
    recommendedPaths.push('docs/ai-pdlc/templates/architecture_intent.md');
    recommendedPaths.push('docs/ai-pdlc/templates/implementation_backlog.md');
    reasons.push('New features should start with architecture intent and an implementation backlog.');
  }

  if (input.hasHumanFeedback) {
    recommendedPaths.push('docs/ai-pdlc/templates/human_feedback_sync.md');
    reasons.push('Human remarks/screenshots should be canonized in human_feedback_sync.');
  }

  if (input.runtimeSensitive || input.usesLocalModelsOrRuntimeAssets) {
    recommendedPaths.push('docs/ai-pdlc/patterns/runtime_assets_and_models.md');
    reasons.push('Runtime-sensitive flows need the runtime assets/models contract.');
  }

  if (input.stateful) {
    recommendedPaths.push('docs/ai-pdlc/patterns/state_machines_and_invariants.md');
    reasons.push('State-heavy flows should carry explicit state-machine/invariant guidance.');
  }

  if (input.timeBoundedQuota) {
    recommendedPaths.push('docs/ai-pdlc/patterns/time_bounded_quotas.md');
    reasons.push('Quota/time-window rules need the quota pattern.');
  }

  if (input.isWebTask) {
    recommendedPaths.push('web/AI-PDLC.md');
    reasons.push('Web tasks in this repo also follow the lighter web-specific AI-PDLC handoff doc.');
  }

  const dedupedPaths = recommendedPaths.filter(
    (value, index, array) => array.indexOf(value) === index
  );

  return {
    stage: input.stage,
    recommended_paths: dedupedPaths,
    resource_uris: dedupedPaths.map(buildRepoDocUri),
    reasons
  };
}

async function summarizeFeaturePackage(featureId) {
  const featureDir = await resolveFeaturePackageDir(featureId);
  const artifactNames = [
    'task_spec.json',
    'task_spec.md',
    'architecture_intent.md',
    'implementation_backlog.md',
    'human_feedback_sync.md'
  ];
  const artifactPaths = [];

  for (const filename of artifactNames) {
    const absolutePath = path.join(featureDir, filename);
    if (await pathExists(absolutePath)) {
      artifactPaths.push(toRepoRelative(absolutePath));
    }
  }

  const validation = await validateFeaturePackageDetailed(featureId);
  let title = featureId;
  let goal = null;
  let taskSpecFormat = null;
  let taskSpecRepoPath = null;
  let acceptanceCriteriaCount = 0;
  let sourceNotesCount = 0;
  let requiredWriteScopeCount = 0;
  let formalContractRequired = false;
  let runtimeSensitive = false;
  let webMinimalCandidate = featureId.includes('web');
  let parseError = null;

  const taskSpecJsonPath = path.join(featureDir, 'task_spec.json');
  if (await pathExists(taskSpecJsonPath)) {
    taskSpecFormat = 'json';
    taskSpecRepoPath = toRepoRelative(taskSpecJsonPath);
    try {
      const parsed = JSON.parse(await fs.readFile(taskSpecJsonPath, 'utf8'));
      title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : title;
      goal = typeof parsed.goal === 'string' ? parsed.goal : null;
      acceptanceCriteriaCount = Array.isArray(parsed.acceptance_criteria)
        ? parsed.acceptance_criteria.length
        : 0;
      sourceNotesCount = Array.isArray(parsed.human_feedback_sync?.source_notes)
        ? parsed.human_feedback_sync.source_notes.length
        : 0;
      requiredWriteScopeCount = Array.isArray(parsed.implementation_contract?.required_write_scope)
        ? parsed.implementation_contract.required_write_scope.length
        : 0;
      formalContractRequired = Boolean(parsed.formal_contract?.required);
      const serialized = JSON.stringify(parsed).toLowerCase();
      runtimeSensitive =
        serialized.includes('runtime') ||
        serialized.includes('asset') ||
        serialized.includes('local models');
      webMinimalCandidate ||= serialized.includes('"web/');
    } catch (error) {
      parseError = error.message;
    }
  } else {
    const taskSpecMdPath = path.join(featureDir, 'task_spec.md');
    if (await pathExists(taskSpecMdPath)) {
      taskSpecFormat = 'markdown';
      taskSpecRepoPath = toRepoRelative(taskSpecMdPath);
    }
  }

  return {
    feature_id: featureId,
    feature_dir: toRepoRelative(featureDir),
    status: validation.valid ? 'ok' : 'invalid',
    title,
    goal,
    task_spec_format: taskSpecFormat,
    task_spec_repo_path: taskSpecRepoPath,
    acceptance_criteria_count: acceptanceCriteriaCount,
    source_notes_count: sourceNotesCount,
    required_write_scope_count: requiredWriteScopeCount,
    formal_contract_required: formalContractRequired,
    runtime_sensitive: runtimeSensitive,
    web_minimal_candidate: webMinimalCandidate,
    artifact_paths: artifactPaths,
    missing_known_artifacts: validation.errors.filter(error => error.startsWith('missing artifact')),
    missing_required_artifacts: validation.errors.filter(error => error.startsWith('missing required')),
    missing_recommended_artifacts: validation.warnings.filter(error =>
      error.startsWith('missing recommended')
    ),
    placeholder_warnings: validation.warnings.filter(error => error.startsWith('placeholder')),
    parse_error: parseError,
    incomplete_reasons: [...validation.errors, ...validation.warnings],
    bundle_uri: buildFeatureBundleUri(featureId)
  };
}

async function validateFeaturePackageDetailed(featureId) {
  const featureDir = await resolveFeaturePackageDir(featureId);
  const errors = [];
  const warnings = [];
  const artifactPaths = [];

  const taskSpecJsonPath = path.join(featureDir, 'task_spec.json');
  const taskSpecMdPath = path.join(featureDir, 'task_spec.md');
  const architecturePath = path.join(featureDir, 'architecture_intent.md');
  const backlogPath = path.join(featureDir, 'implementation_backlog.md');
  const humanFeedbackPath = path.join(featureDir, 'human_feedback_sync.md');

  const existingTaskSpec = (await pathExists(taskSpecJsonPath))
    ? taskSpecJsonPath
    : (await pathExists(taskSpecMdPath))
      ? taskSpecMdPath
      : null;

  if (!existingTaskSpec) {
    errors.push('missing required artifact: task_spec.json or task_spec.md');
  }
  if (!(await pathExists(backlogPath))) {
    errors.push('missing required artifact: implementation_backlog.md');
  }
  if (!(await pathExists(architecturePath))) {
    warnings.push('missing recommended artifact: architecture_intent.md');
  }
  if (!(await pathExists(humanFeedbackPath))) {
    warnings.push('missing recommended artifact: human_feedback_sync.md');
  }

  for (const candidate of [
    existingTaskSpec,
    architecturePath,
    backlogPath,
    humanFeedbackPath
  ].filter(Boolean)) {
    artifactPaths.push(toRepoRelative(candidate));
  }

  if (existingTaskSpec && existingTaskSpec.endsWith('.json')) {
    const taskSpecValidation = await validateTaskSpecJson(existingTaskSpec);
    if (taskSpecValidation.hasBlockingIssue) {
      errors.push(...taskSpecValidation.messages.map(message => `task_spec validation: ${message}`));
    } else {
      warnings.push(
        ...taskSpecValidation.messages
          .filter(message => message.includes('recommended key missing') || message.includes('scope note'))
          .map(message => `task_spec note: ${message}`)
      );
    }
  }

  for (const artifactPath of artifactPaths) {
    const content = await fs.readFile(path.resolve(repoRoot, artifactPath), 'utf8');
    if (content.includes('<feature>')) {
      warnings.push(`placeholder remains in ${artifactPath}: "<feature>"`);
    }
    if (content.includes('Короткое название задачи')) {
      warnings.push(`placeholder remains in ${artifactPath}: template title not replaced`);
    }
  }

  return {
    feature_id: featureId,
    status: errors.length === 0 ? 'ok' : 'invalid',
    valid: errors.length === 0,
    errors,
    warnings,
    artifact_paths: artifactPaths,
    bundle_uri: buildFeatureBundleUri(featureId)
  };
}

async function scaffoldFeaturePackage({ featureId, title, goal, overwrite }) {
  const featureDir = path.resolve(repoRoot, 'docs/ai-pdlc/features', featureId);
  await fs.mkdir(featureDir, { recursive: true });

  const createdFiles = [];
  const templateNames = [
    'task_spec.json',
    'architecture_intent.md',
    'implementation_backlog.md',
    'human_feedback_sync.md'
  ];

  for (const templateName of templateNames) {
    const sourcePath = path.resolve(repoRoot, 'docs/ai-pdlc/templates', templateName);
    const destinationPath = path.join(featureDir, templateName);

    if (!overwrite && (await pathExists(destinationPath))) {
      continue;
    }

    if (templateName === 'task_spec.json') {
      const parsed = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
      parsed.title = title ?? parsed.title;
      parsed.goal = goal ?? parsed.goal;
      await fs.writeFile(destinationPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    } else {
      const templateText = await fs.readFile(sourcePath, 'utf8');
      await fs.writeFile(
        destinationPath,
        templateText.replaceAll('<feature>', featureId),
        'utf8'
      );
    }

    createdFiles.push(toRepoRelative(destinationPath));
  }

  return {
    feature_id: featureId,
    feature_dir: toRepoRelative(featureDir),
    created_files: createdFiles,
    bundle_uri: buildFeatureBundleUri(featureId)
  };
}

function toRepoRelative(absolutePath) {
  return path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/');
}

function textResult(text, structuredContent) {
  const result = {
    content: [{ type: 'text', text }]
  };

  if (structuredContent !== undefined) {
    result.structuredContent = structuredContent;
  }

  return result;
}

function errorResult(message) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true
  };
}

function indent(text) {
  return text
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');
}

function truncateInline(text, maxLength = 220) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 18)}\n\n[truncated output]`;
}

async function readRepoDoc(relativePath) {
  return fs.readFile(path.resolve(repoRoot, relativePath), 'utf8');
}

async function safeStat(absolutePath) {
  try {
    return await fs.stat(absolutePath);
  } catch {
    return null;
  }
}

async function pathExists(absolutePath) {
  return (await safeStat(absolutePath)) !== null;
}

function formatCliHelp() {
  return [
    'Usage: ai-pdlc-mcp [--repo-root <path>]',
    '',
    'Starts the AI-PDLC MCP server over stdio.',
    '',
    'Options:',
    '  --repo-root <path>  Explicit target repository root.',
    '  -h, --help          Show this help.'
  ].join('\n');
}

function parseCliArgs(argv) {
  const options = {
    help: false,
    repoRootOption: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--repo-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --repo-root.');
      }
      options.repoRootOption = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument "${arg}".`);
  }

  return options;
}

function isDirectExecution(metaUrl) {
  if (!process.argv[1]) {
    return false;
  }

  return metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

export async function runStdioServer({ repoRoot: explicitRepoRoot, stderr = process.stderr } = {}) {
  const resolution =
    explicitRepoRoot === undefined
      ? await resolveRepoRoot()
      : await resolveRepoRoot({ explicitRepoRoot });

  configureRepoRoot(resolution.repoRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  stderr.write(`ai-pdlc MCP server running on stdio for repo ${repoRoot}\n`);
}

export async function runMcpCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const options = parseCliArgs(argv);

  if (options.help) {
    stdout.write(`${formatCliHelp()}\n`);
    return;
  }

  await runStdioServer({
    repoRoot: options.repoRootOption ?? undefined,
    stderr
  });
}

if (isDirectExecution(import.meta.url)) {
  runMcpCli().catch(error => {
    console.error('ai-pdlc MCP server failed:', error);
    process.exit(1);
  });
}
