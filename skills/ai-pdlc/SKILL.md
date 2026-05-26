---
name: ai-pdlc
description: Use when working in a repository that follows the AI-PDLC process and needs AI-PDLC doc lookup, feature-package scaffolding or validation, or task execution "по процессу ai-pdlc" via the local ai_pdlc MCP server.
---

# AI-PDLC

Use this skill when the repository contains `docs/ai-pdlc` or the user explicitly asks to work "по процессу ai-pdlc".

## Workflow

1. Confirm the active repo root.
   - Prefer the local `ai_pdlc` MCP server.
   - If the server is unavailable, inspect `docs/ai-pdlc/README.md` directly.
2. Load only the process assets needed for the current phase.
   - intake: `recommend_process_assets`, `aipdlc_search_docs`
   - execution: `aipdlc_read_doc`, `get_feature_package_summary`
   - review: `aipdlc_validate_feature_package`
3. If the task changes product behavior or process rules, canonize it in `docs/ai-pdlc/features/<feature_id>/`.
4. If screenshots or spoken remarks drive the task, sync them into tracked AI-PDLC artifacts before continuing implementation.
5. Do not claim done without proof and post-work evidence required by the AI-PDLC process.

## Preferred MCP calls

- `recommend_process_assets`
- `aipdlc_search_docs`
- `aipdlc_read_doc`
- `get_feature_package_summary`
- `aipdlc_validate_feature_package`
- `scaffold_feature_package`
