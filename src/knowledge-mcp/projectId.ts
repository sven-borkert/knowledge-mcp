import { execSync } from 'child_process';
import { basename } from 'path';
import { cwd } from 'process';

import { slugify } from './utils.js';

/**
 * Extract git remote origin URL from current directory.
 * Returns the git remote origin URL if found, null otherwise.
 */
export function getGitRemoteUrl(): string | null {
  try {
    const result = execSync('git config --get remote.origin.url', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return result || null;
  } catch {
    // Git not installed or other error
    return null;
  }
}

/**
 * Get project ID from git remote or directory name.
 *
 * The project ID is determined by:
 * 1. First trying to get the git remote origin URL (used as-is)
 * 2. If no git remote, using the current directory name (slugified)
 *
 * Returns a project identifier string.
 */
export function getProjectId(): string {
  // Try to get git remote URL first
  const gitUrl = getGitRemoteUrl();

  if (gitUrl) {
    // Use the git URL as-is (as specified in the technical spec)
    return gitUrl;
  }

  // Fall back to current directory name
  const currentDir = cwd();
  const dirName = basename(currentDir);

  // Slugify the directory name for safety
  return slugify(dirName);
}
