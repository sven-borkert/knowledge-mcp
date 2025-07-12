#!/usr/bin/env node

import { main } from './server.js';

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
