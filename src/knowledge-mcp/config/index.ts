import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Configuration from environment
export const STORAGE_PATH = resolve(
  process.env.KNOWLEDGE_MCP_HOME ?? join(homedir(), '.knowledge-mcp')
);
export const LOG_LEVEL = process.env.KNOWLEDGE_MCP_LOG_LEVEL ?? 'INFO';

// Simple logger
export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (LOG_LEVEL === 'DEBUG') {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: unknown[]): void => {
    if (['INFO', 'DEBUG'].includes(LOG_LEVEL)) {
      console.error(`[INFO] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: unknown[]): void => {
    if (['WARN', 'INFO', 'DEBUG'].includes(LOG_LEVEL)) {
      console.error(`[WARN] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: unknown[]): void => {
    console.error(`[ERROR] ${message}`, ...args);
  },
};

// Get package version dynamically
let packageVersion = '0.0.0-unknown';
try {
  // Get the directory of this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = resolve(__filename, '..');

  // Look for package.json in various locations
  const possiblePaths = [
    resolve(__dirname, '../../../package.json'), // Development: src/knowledge-mcp/config -> root
    resolve(__dirname, '../../package.json'), // Installed: dist/knowledge-mcp -> root
    resolve(__dirname, '../package.json'), // Alternative structure
  ];

  for (const pkgPath of possiblePaths) {
    try {
      const packageData = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
      if (packageData.version) {
        packageVersion = packageData.version;
        break;
      }
    } catch {
      // Try next path
    }
  }
} catch (error) {
  console.error('Failed to read package version:', error);
}

// Server metadata
export const SERVER_CONFIG = {
  name: 'Knowledge MCP Server',
  version: packageVersion,
  description: `Centralized knowledge management for AI assistants. Replaces local CLAUDE.md files with Git-backed project knowledge, searchable documentation, and integrated TODO tracking.

Key features:
• Project instructions management (replaces CLAUDE.md)
• Structured knowledge documents with chapters
• Full-text search across all documentation
• TODO management with task tracking
• Token-efficient chapter operations
`,
};
