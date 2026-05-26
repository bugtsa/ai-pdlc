# ai-pdlc

Cross-client AI-PDLC distribution repository.

This repository packages:

- `ai-pdlc` — operator CLI for setup, doctor, and uninstall flows
- `ai-pdlc-mcp` — local stdio MCP server
- bundled Codex skill `skills/ai-pdlc/SKILL.md`
- Claude Desktop extension manifest under `claude-desktop/`
- starter packaging templates for Homebrew and WinGet

## Repository Layout

```text
src/
  bin/
  core/
  index.mjs
skills/
  ai-pdlc/
claude-desktop/
packaging/
  homebrew/
  winget/
scripts/
  dev/
```

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Verify repo-root detection against a target project that contains `docs/ai-pdlc`:

```bash
node src/bin/ai-pdlc.mjs doctor --repo-root /path/to/target-repo
```

3. Smoke-test the MCP server:

```bash
node scripts/dev/smoke.mjs --repo-root /path/to/target-repo
```

## Client Setup

### Codex

```bash
ai-pdlc setup-codex --repo-root /path/to/target-repo
```

Installs the bundled skill into `~/.codex/skills/ai-pdlc` and registers the MCP server with `codex mcp add`.

### Claude Code

```bash
ai-pdlc setup-claude-code --repo-root /path/to/target-repo
```

Registers the MCP server with `claude mcp add --scope user`.

### Claude Desktop

- Package this repo into an `.mcpb` bundle using the Desktop manifest in `claude-desktop/manifest.json`.
- The Desktop user selects a repo root via the `repoRoot` directory field, which is mapped to `AI_PDLC_REPO_ROOT`.

## Release Surfaces

- Homebrew template: `packaging/homebrew/ai-pdlc.rb`
- WinGet templates: `packaging/winget/*`
- Claude Desktop manifest: `claude-desktop/manifest.json`

Before publishing, replace these placeholders:

- GitHub owner/repo URLs
- release asset URLs and SHA256 values
- package identifier / publisher strings for WinGet
- license and repository metadata if you want public distribution

## Current Status

This repository is extract-ready but still uses placeholders for actual release coordinates and installer hashes.
