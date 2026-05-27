# ai-pdlc

Cross-client AI-PDLC distribution repository.

This repository packages:

- `ai-pdlc` — operator CLI for setup, doctor, and uninstall flows
- `ai-pdlc-mcp` — local stdio MCP server
- bundled Codex skill `skills/ai-pdlc/SKILL.md`
- Claude Desktop extension manifest under `claude-desktop/`
- starter packaging templates for Homebrew and WinGet

Canonical upstream: `https://github.com/bugtsa/ai-pdlc`

Latest release: `https://github.com/bugtsa/ai-pdlc/releases/latest`

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
  release/
fixtures/
  repo-root/
```

## Install Surfaces

- `npm` is the canonical distribution surface for the CLI.
- `Homebrew` is a thin wrapper around the npm tarball.
- `Claude Desktop` uses a dedicated `.mcpb` bundle.
- `WinGet` uses a Windows portable zip plus a Node runtime dependency.

This keeps one codebase and one Node runtime story across Codex, Claude Code, and Claude Desktop.

## Install

### macOS

```bash
brew install bugtsa/ai-pdlc/ai-pdlc
```

### Claude Desktop

- Download the latest `.mcpb` asset from the GitHub release page.
- Open it in Claude Desktop and choose the target repo root when prompted.

### Windows

- The release includes a Windows portable zip with native `.exe` launchers.
- WinGet manifests are checked in under `packaging/winget/`.

Quick local smoke test on a Windows machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\test-release-windows.ps1 -RepoRoot C:\path\to\your\repo
```

## Local Development

1. Install dependencies:

```bash
npm ci
```

2. Run the autonomous smoke test. It uses the local fixture repo under `fixtures/repo-root` by default:

```bash
npm test
```

3. Verify repo-root detection against an external target project if needed:

```bash
node src/bin/ai-pdlc.mjs doctor --repo-root /path/to/target-repo
```

4. Smoke-test the MCP server against an external target repo:

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

- Build the `.mcpb` bundle:

```bash
npm run bundle:claude-desktop
```

- The build writes `dist/ai-pdlc-<version>.mcpb`.
- The Desktop user selects a repo root via the `repoRoot` directory field, which is mapped to `AI_PDLC_REPO_ROOT`.
- A release-ready bundle is published as a GitHub release asset.

### WinGet

- Build the Windows portable zip:

```bash
npm run bundle:windows-portable
```

- The build writes `dist/ai-pdlc-<version>-windows-portable.zip`.
- The portable bundle ships `ai-pdlc.cmd` and `ai-pdlc-mcp.cmd`, so the WinGet manifest should declare a Node runtime dependency.

## Release Surfaces

- Homebrew template: `packaging/homebrew/ai-pdlc.rb`
- WinGet templates: `packaging/winget/*`
- Claude Desktop manifest: `claude-desktop/manifest.json`
- GitHub Actions CI: `.github/workflows/ci.yml`
- GitHub tag release workflow: `.github/workflows/release.yml`

Before publishing, replace these placeholders:

- GitHub owner/repo URLs
- release asset URLs and SHA256 values
- package identifier / publisher strings for WinGet
- license and repository metadata if you want public distribution

## Release Flow

1. `npm ci`
2. `npm test`
3. `npm run manifest:validate`
4. `npm run bundle:claude-desktop`
5. `npm run bundle:windows-portable`
6. `npm run pack:npm`
7. Publish the npm tarball and attach the `dist/*` assets to the GitHub release tag

The generated `.mcpb` bundle is unsigned by default. If you need trust metadata, add a signing step with `mcpb sign` before publishing the release asset.

## License Status

This repository is released under `Apache-2.0`.

## Current Status

This repository is now self-testable without depending on the original `freud` workspace. Public release coordinates and installer hashes still remain placeholders.
