#!/usr/bin/env node

import packageJson from '../../package.json' with { type: 'json' };

import { main } from './server.js';

// Check for --version flag
if (process.argv.includes('--version')) {
  // eslint-disable-next-line no-console
  console.log(packageJson.version);
  process.exit(0);
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
