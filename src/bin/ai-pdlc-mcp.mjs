#!/usr/bin/env node

import { runMcpCli } from '../index.mjs';

runMcpCli().catch(error => {
  console.error('ai-pdlc-mcp failed:', error);
  process.exit(1);
});
