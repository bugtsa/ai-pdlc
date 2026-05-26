import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const packageRoot = path.resolve(__dirname, '../..');
export const packagedSkillDir = path.join(packageRoot, 'skills', 'ai-pdlc');
export const packagedSkillFile = path.join(packagedSkillDir, 'SKILL.md');
export const codexSkillInstallDir = path.join('~', '.codex', 'skills', 'ai-pdlc');
export const mcpCliEntryPoint = path.join(packageRoot, 'src', 'bin', 'ai-pdlc-mcp.mjs');
export const aiPdlcCliEntryPoint = path.join(packageRoot, 'src', 'bin', 'ai-pdlc.mjs');
export const claudeDesktopManifestPath = path.join(packageRoot, 'claude-desktop', 'manifest.json');
