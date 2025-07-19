import { execSync, spawnSync, spawn, exec as execCallback } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readlinkSync,
  unlinkSync,
  renameSync,
  realpathSync,
  lstatSync,
  rmSync,
  readdirSync,
} from 'fs';
import {
  access,
  mkdir,
  readFile,
  writeFile,
  readlink,
  unlink,
  rename,
  realpath,
  lstat,
  rm,
} from 'fs/promises';
import { join, resolve, isAbsolute, dirname, sep } from 'path';
import { promisify } from 'util';

import slugifyLib from 'slugify';

import { logger } from './config/index.js';

const exec = promisify(execCallback);

// Enhanced file locking mechanism with proper queuing to prevent race conditions
interface LockQueue {
  queue: Array<{
    operation: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>;
  processing: boolean;
}

const fileLocks = new Map<string, LockQueue>();

// Global index lock for critical index.json operations
const INDEX_LOCK_KEY = '__global_index_lock__';

/**
 * Acquire global index lock for index.json operations
 * This ensures index.json operations are fully serialized across all projects
 */
export async function acquireIndexLock<T>(
  storagePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const indexFile = join(storagePath, 'index.json');
  
  // Use both the specific file lock and a global index operation lock
  return acquireFileLock(INDEX_LOCK_KEY, async () => {
    return acquireFileLock(indexFile, operation);
  });
}

/**
 * Add a small random delay to reduce contention in high-concurrency scenarios
 */
export async function addConcurrencyDelay(): Promise<void> {
  // Random delay between 1-10ms to stagger concurrent operations
  const delay = Math.floor(Math.random() * 10) + 1;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Acquire a lock for a file path to prevent concurrent operations
 * Uses a queue-based approach to ensure proper serialization
 */
export async function acquireFileLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  // Normalize file path to ensure consistent locking keys
  const normalizedPath = resolve(filePath);
  
  return new Promise<T>((resolve, reject) => {
    // Get or create lock queue for this file
    let lockQueue = fileLocks.get(normalizedPath);
    if (!lockQueue) {
      lockQueue = { queue: [], processing: false };
      fileLocks.set(normalizedPath, lockQueue);
    }

    // Add operation to queue
    lockQueue.queue.push({
      operation,
      resolve,
      reject,
    });

    // Process queue if not already processing
    if (!lockQueue.processing) {
      processLockQueue(normalizedPath);
    }
  });
}

/**
 * Process the lock queue for a specific file path
 * Ensures operations are executed sequentially
 */
async function processLockQueue(filePath: string): Promise<void> {
  const lockQueue = fileLocks.get(filePath);
  if (!lockQueue || lockQueue.processing) {
    return;
  }

  lockQueue.processing = true;

  try {
    while (lockQueue.queue.length > 0) {
      const { operation, resolve, reject } = lockQueue.queue.shift()!;
      
      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
  } finally {
    lockQueue.processing = false;
    
    // Clean up empty lock queues
    if (lockQueue.queue.length === 0) {
      fileLocks.delete(filePath);
    }
  }
}

/**
 * Synchronous version of file lock using a simple retry mechanism
 */
export function acquireFileLockSync<T>(filePath: string, operation: () => T): T {
  // For sync operations, we'll use a simple retry with exponential backoff
  let attempts = 0;
  const maxAttempts = 10;
  const baseDelay = 10; // 10ms base delay

  while (attempts < maxAttempts) {
    try {
      // Check if there's an async lock in progress
      const existingLock = fileLocks.get(filePath);
      if (!existingLock) {
        // No async operation in progress, proceed
        return operation();
      }

      // Wait and retry
      attempts++;
      const delay = baseDelay * Math.pow(2, attempts - 1); // Exponential backoff
      const end = Date.now() + delay;
      while (Date.now() < end) {
        // Busy wait for small delays
      }
    } catch (error) {
      if (attempts === maxAttempts - 1) {
        throw error; // Re-throw on final attempt
      }
      attempts++;
      const delay = baseDelay * Math.pow(2, attempts - 1);
      const end = Date.now() + delay;
      while (Date.now() < end) {
        // Busy wait for small delays
      }
    }
  }

  throw new Error(`Failed to acquire file lock for ${filePath} after ${maxAttempts} attempts`);
}

export interface ProjectIndex {
  projects: Record<string, string>;
}

/**
 * Validate that a requested path is within the base directory.
 * Prevents directory traversal attacks with comprehensive security checks.
 */
export function validatePath(basePath: string, requestedPath: string): string {
  // Input validation
  if (!requestedPath || typeof requestedPath !== 'string') {
    throw new Error('Invalid path: Path cannot be empty or non-string');
  }

  if (!basePath || typeof basePath !== 'string') {
    throw new Error('Invalid path: Base path cannot be empty or non-string');
  }

  // Reject absolute paths
  if (isAbsolute(requestedPath)) {
    throw new Error('Invalid path: Absolute paths not allowed');
  }

  // Check for Windows drive letters (more comprehensive)
  if (/^[A-Za-z]:/.test(requestedPath)) {
    throw new Error('Invalid path: Drive letters not allowed');
  }

  // Check for backslashes (Windows paths) and other suspicious characters
  if (requestedPath.includes('\\')) {
    throw new Error('Invalid path: Backslashes not allowed');
  }

  // Check for null bytes (security vulnerability)
  if (requestedPath.includes('\0')) {
    throw new Error('Invalid path: Null bytes not allowed');
  }

  // Check for overly long paths (DoS prevention)
  if (requestedPath.length > 1024) {
    throw new Error('Invalid path: Path too long');
  }

  // Normalize and resolve paths
  const normalizedBase = resolve(basePath);
  let resolvedPath: string;

  try {
    resolvedPath = resolve(normalizedBase, requestedPath);
  } catch (error) {
    throw new Error(`Invalid path: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Basic containment check
  if (!resolvedPath.startsWith(normalizedBase + sep) && resolvedPath !== normalizedBase) {
    throw new Error('Invalid path: Access denied - path outside base directory');
  }

  // Enhanced symlink security check
  if (existsSync(resolvedPath)) {
    try {
      // Get real path resolving all symlinks
      const realPath = realpathSync(resolvedPath);

      // Ensure the real path is still within the base directory
      if (!realPath.startsWith(normalizedBase + sep) && realPath !== normalizedBase) {
        throw new Error('Invalid path: Symlink points outside allowed directory');
      }

      // Check each component in the path for symlinks that could escape
      let currentPath = resolvedPath;
      while (currentPath !== normalizedBase) {
        if (existsSync(currentPath)) {
          const stats = lstatSync(currentPath);
          if (stats.isSymbolicLink()) {
            const linkTarget = readlinkSync(currentPath);
            const absoluteLinkTarget = isAbsolute(linkTarget)
              ? linkTarget
              : resolve(dirname(currentPath), linkTarget);

            if (
              !absoluteLinkTarget.startsWith(normalizedBase + sep) &&
              absoluteLinkTarget !== normalizedBase
            ) {
              throw new Error('Invalid path: Symlink component points outside allowed directory');
            }
          }
        }
        currentPath = dirname(currentPath);
      }

      return realPath;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid path:')) {
        throw error; // Re-throw our security errors
      }
      throw new Error(
        `Invalid path: Security check failed - ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return resolvedPath;
}

/**
 * Async version of validatePath.
 * Validate that a requested path is within the base directory.
 * Prevents directory traversal attacks with comprehensive security checks.
 */
export async function validatePathAsync(basePath: string, requestedPath: string): Promise<string> {
  // Input validation
  if (!requestedPath || typeof requestedPath !== 'string') {
    throw new Error('Invalid path: Path cannot be empty or non-string');
  }

  if (!basePath || typeof basePath !== 'string') {
    throw new Error('Invalid path: Base path cannot be empty or non-string');
  }

  // Reject absolute paths
  if (isAbsolute(requestedPath)) {
    throw new Error('Invalid path: Absolute paths not allowed');
  }

  // Check for Windows drive letters (more comprehensive)
  if (/^[A-Za-z]:/.test(requestedPath)) {
    throw new Error('Invalid path: Drive letters not allowed');
  }

  // Check for backslashes (Windows paths) and other suspicious characters
  if (requestedPath.includes('\\')) {
    throw new Error('Invalid path: Backslashes not allowed');
  }

  // Check for null bytes (security vulnerability)
  if (requestedPath.includes('\0')) {
    throw new Error('Invalid path: Null bytes not allowed');
  }

  // Check for overly long paths (DoS prevention)
  if (requestedPath.length > 1024) {
    throw new Error('Invalid path: Path too long');
  }

  // Normalize and resolve paths
  const normalizedBase = resolve(basePath);
  let resolvedPath: string;

  try {
    resolvedPath = resolve(normalizedBase, requestedPath);
  } catch (error) {
    throw new Error(`Invalid path: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Basic containment check
  if (!resolvedPath.startsWith(normalizedBase + sep) && resolvedPath !== normalizedBase) {
    throw new Error('Invalid path: Access denied - path outside base directory');
  }

  // Enhanced symlink security check
  try {
    await access(resolvedPath);

    // Get real path resolving all symlinks
    const realPath = await realpath(resolvedPath);

    // Ensure the real path is still within the base directory
    if (!realPath.startsWith(normalizedBase + sep) && realPath !== normalizedBase) {
      throw new Error('Invalid path: Symlink points outside allowed directory');
    }

    // Check each component in the path for symlinks that could escape
    let currentPath = resolvedPath;
    while (currentPath !== normalizedBase) {
      try {
        await access(currentPath);
        const stats = await lstat(currentPath);
        if (stats.isSymbolicLink()) {
          const linkTarget = await readlink(currentPath);
          const absoluteLinkTarget = isAbsolute(linkTarget)
            ? linkTarget
            : resolve(dirname(currentPath), linkTarget);

          if (
            !absoluteLinkTarget.startsWith(normalizedBase + sep) &&
            absoluteLinkTarget !== normalizedBase
          ) {
            throw new Error('Invalid path: Symlink component points outside allowed directory');
          }
        }
      } catch (error) {
        // File doesn't exist yet, which is ok for write operations
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      currentPath = dirname(currentPath);
    }

    return realPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist yet, which is ok for write operations
      return resolvedPath;
    }
    if (error instanceof Error && error.message.includes('Invalid path:')) {
      throw error; // Re-throw our security errors
    }
    throw new Error(
      `Invalid path: Security check failed - ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Convert text to a safe slug.
 */
export function slugify(text: string): string {
  if (!text?.trim()) {
    return 'untitled';
  }

  // Remove path separators first to handle path traversal attempts
  let processed = text.replace(/[/\\]/g, '_');

  // Remove directory traversal patterns for security
  processed = processed.replace(/\.\./g, '');

  // Handle single dots used as directory separators
  processed = processed.replace(/_\._/g, '_').replace(/\._/g, '_').replace(/_\./g, '_');

  // Collapse multiple underscores
  while (processed.includes('__')) {
    processed = processed.replace(/__/g, '_');
  }

  // Remove leading/trailing underscores
  processed = processed.replace(/^_+|_+$/g, '');

  // Check if text became empty
  if (!processed || processed.replace(/[_.]/g, '') === '') {
    return 'untitled';
  }

  // Use slugify library with custom options
  const slugified = slugifyLib(processed, {
    lower: true,
    strict: true,
    replacement: '-',
  });

  return slugified || 'untitled';
}

/**
 * Execute a git command with isolated credentials and secure argument handling.
 * Prevents command injection by using execSync with argument array instead of shell string.
 */
export function gitCommand(
  repoPath: string,
  ...args: string[]
): { stdout: string; stderr: string } {
  // Validate repository path
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('Invalid repository path');
  }

  // Validate each git argument for security
  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new Error('Invalid git argument: all arguments must be strings');
    }

    // Check for dangerous characters that could enable command injection
    if (
      arg.includes(';') ||
      arg.includes('&') ||
      arg.includes('|') ||
      arg.includes('`') ||
      arg.includes('$') ||
      arg.includes('\n') ||
      arg.includes('\r') ||
      arg.includes('\0')
    ) {
      throw new Error(`Invalid git argument: dangerous characters detected in "${arg}"`);
    }

    // Prevent extremely long arguments (DoS prevention)
    if (arg.length > 1000) {
      throw new Error('Invalid git argument: argument too long');
    }
  }

  // Build secure command array with git configuration
  const gitArgs = [
    '-c',
    'user.name=Knowledge MCP Server',
    '-c',
    'user.email=knowledge-mcp@localhost',
    ...args,
  ];

  // Use spawnSync for safer argument handling
  const result = spawnSync('git', gitArgs, {
    cwd: repoPath,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  // Check exit code for command failure
  if (result.status !== 0) {
    throw new Error(
      `Git command failed with exit code ${result.status}: ${result.stderr || 'Unknown error'}`
    );
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Initialize storage directory and git repository.
 */
export function initializeStorage(storagePath: string): void {
  // Create directory if it doesn't exist
  mkdirSync(storagePath, { recursive: true });

  // Check if git repo already exists
  const gitDir = join(storagePath, '.git');
  const isNewRepo = !existsSync(gitDir);

  // Ensure .gitignore exists and is up to date (for both new and existing repos)
  ensureLogGitignore(storagePath);

  // For existing repos, remove any newly ignored files from git tracking
  if (!isNewRepo) {
    removeIgnoredFilesFromTracking(storagePath);
    return;
  }

  // Initialize git repository
  execSync('git init', { cwd: storagePath });

  // Create initial commit if repository is empty
  try {
    execSync('git rev-parse HEAD', { cwd: storagePath, stdio: 'ignore' });
  } catch {
    // No commits yet, create initial commit
    const readmePath = join(storagePath, 'README.md');
    writeFileSync(
      readmePath,
      '# Knowledge MCP Storage\n\nThis directory contains project knowledge managed by Knowledge MCP Server.\n'
    );

    gitCommand(storagePath, 'add', 'README.md');
    gitCommand(storagePath, 'commit', '-m', 'Initial commit');
  }
}

/**
 * Check if git remote "origin" exists in the repository.
 */
export function hasGitRemote(repoPath: string): boolean {
  try {
    const { stdout } = gitCommand(repoPath, 'remote', 'get-url', 'origin');
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Push changes to origin/main.
 */
export function pushToOrigin(repoPath: string): void {
  try {
    gitCommand(repoPath, 'push', 'origin', 'main');
  } catch (error) {
    // Log error but don't fail the operation
    console.error(`Git push failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Pull changes from origin/main.
 * Performs a hard reset to avoid merge conflicts.
 */
export function pullFromOrigin(repoPath: string): void {
  try {
    // Only pull if remote exists
    if (!hasGitRemote(repoPath)) {
      // eslint-disable-next-line no-console
      logger.info('No git remote configured, skipping pull');
      return;
    }

    // eslint-disable-next-line no-console
    logger.info('Pulling latest changes from origin/main...');

    // Fetch latest changes from remote
    gitCommand(repoPath, 'fetch', 'origin', 'main');

    // Hard reset to match remote (overwrites local changes)
    gitCommand(repoPath, 'reset', '--hard', 'origin/main');

    // eslint-disable-next-line no-console
    logger.info('Successfully pulled and reset to origin/main');
  } catch (error) {
    // Log warning but don't fail the operation
    console.warn(`Git pull failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Automatically commit all changes in the repository.
 */
export function autoCommit(repoPath: string, message: string): void {
  try {
    // Stage all changes
    gitCommand(repoPath, 'add', '-A');

    // Check if there are changes to commit
    const { stdout } = gitCommand(repoPath, 'status', '--porcelain');

    if (stdout.trim()) {
      // Commit changes
      gitCommand(repoPath, 'commit', '-m', message);

      // Push to origin if it exists
      if (hasGitRemote(repoPath)) {
        pushToOrigin(repoPath);
      }
    }
  } catch (error) {
    // Log error but don't fail the operation
    console.error(
      `Git auto-commit failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Read the project index mapping original names to slugified directories.
 */
export function readProjectIndex(storagePath: string): Record<string, string> {
  const indexFile = join(storagePath, 'index.json');

  if (!existsSync(indexFile)) {
    return {};
  }

  try {
    const content = readFileSync(indexFile, 'utf8');
    const data = JSON.parse(content) as ProjectIndex;
    return data.projects && typeof data.projects === 'object' ? data.projects : {};
  } catch {
    // If index is corrupted, return empty dict
    return {};
  }
}

/**
 * Write the project index mapping.
 */
export function writeProjectIndex(storagePath: string, index: Record<string, string>): void {
  const indexFile = join(storagePath, 'index.json');

  return acquireFileLockSync(indexFile, () => {
    try {
      // Write to temporary file first with unique name to avoid conflicts
      const tempFile = `${indexFile}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
      writeFileSync(tempFile, JSON.stringify({ projects: index }, null, 2));

      // Atomic rename
      renameSync(tempFile, indexFile);

      // Commit the index change
      autoCommit(storagePath, 'Update project index');
    } catch (error) {
      // Clean up temp file if it exists (use a pattern to clean any temp files)
      const dir = dirname(indexFile);
      const indexName = 'index.json';

      try {
        const files = readdirSync(dir);
        files
          .filter((f) => f.startsWith(`${indexName}.tmp.`))
          .forEach((f) => {
            try {
              unlinkSync(join(dir, f));
            } catch {
              // Ignore cleanup errors
            }
          });
      } catch {
        // Ignore cleanup errors
      }

      throw new Error(
        `Failed to write project index: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Get the directory path for a project, handling the index mapping.
 * Returns tuple of [original_project_id, project_directory_path]
 * This version does NOT create entries for non-existent projects.
 */
export function getProjectDirectory(
  storagePath: string,
  projectId: string
): [string, string] | null {
  const index = readProjectIndex(storagePath);

  // Check if project_id is already in index
  if (projectId in index) {
    const dirName = index[projectId];
    return [projectId, join(storagePath, 'projects', dirName)];
  }

  // Project doesn't exist - return null instead of creating entry
  return null;
}

/**
 * Create a new project entry in the index and return its directory path.
 * This is the only function that should create new index entries.
 * Returns tuple of [original_project_id, project_directory_path]
 */
export function createProjectEntry(storagePath: string, projectId: string): [string, string] {
  const index = readProjectIndex(storagePath);

  // Check if project_id is already in index
  if (projectId in index) {
    const dirName = index[projectId];
    return [projectId, join(storagePath, 'projects', dirName)];
  }

  // For new projects, create mapping
  let slugified = slugify(projectId);

  // Ensure unique directory name
  const baseSlug = slugified;
  let counter = 1;
  while (Object.values(index).includes(slugified)) {
    slugified = `${baseSlug}-${counter}`;
    counter++;
  }

  // Update index
  index[projectId] = slugified;
  writeProjectIndex(storagePath, index);

  return [projectId, join(storagePath, 'projects', slugified)];
}

/**
 * Delete a project directory and remove it from the index mapping.
 * This is a synchronous operation that performs atomic updates.
 */
export function deleteProjectDirectory(storagePath: string, projectId: string): void {
  const index = readProjectIndex(storagePath);

  // Check if project exists in index
  if (!(projectId in index)) {
    throw new Error(`Project '${projectId}' not found in index`);
  }

  const dirName = index[projectId];
  const projectPath = join(storagePath, 'projects', dirName);

  // Delete directory if it exists
  if (existsSync(projectPath)) {
    rmSync(projectPath, { recursive: true, force: true });
  }

  // Remove from index
  const { [projectId]: _removed, ...newIndex } = index;
  writeProjectIndex(storagePath, newIndex);
}

/**
 * Async version of deleteProjectDirectory.
 * Delete a project directory and remove it from the index mapping.
 */
export async function deleteProjectDirectoryAsync(
  storagePath: string,
  projectId: string
): Promise<void> {
  const index = await readProjectIndexAsync(storagePath);

  // Check if project exists in index
  if (!(projectId in index)) {
    throw new Error(`Project '${projectId}' not found in index`);
  }

  const dirName = index[projectId];
  const projectPath = join(storagePath, 'projects', dirName);

  // Delete directory if it exists
  try {
    await access(projectPath);
    await rm(projectPath, { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist, continue with index cleanup
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  // Remove from index
  const { [projectId]: _removed, ...newIndex } = index;
  await writeProjectIndexAsync(storagePath, newIndex);
}

/**
 * Interface for method call log entries
 */
export interface MethodLogEntry {
  timestamp: string;
  method: string;
  project_id?: string;
  filename?: string;
  chapter_title?: string;
  section_header?: string;
  success: boolean;
  error?: string;
  traceId?: string;
  duration?: number;
  params?: Record<string, unknown>;
}

/**
 * Log a method call to the activity log file in the storage folder
 */
export function logMethodCall(
  storagePath: string,
  method: string,
  params: {
    project_id?: string;
    filename?: string;
    chapter_title?: string;
    section_header?: string;
    success: boolean;
    error?: string;
    traceId?: string;
    duration?: number;
  }
): void {
  try {
    const logEntry: MethodLogEntry = {
      timestamp: new Date().toISOString(),
      method,
      success: params.success,
      ...(params.project_id && { project_id: params.project_id }),
      ...(params.filename && { filename: params.filename }),
      ...(params.chapter_title && { chapter_title: params.chapter_title }),
      ...(params.section_header && { section_header: params.section_header }),
      ...(params.error && { error: params.error }),
      ...(params.traceId && { traceId: params.traceId }),
      ...(params.duration !== undefined && { duration: params.duration }),
    };

    const logFile = join(storagePath, 'activity.log');
    const logLine = JSON.stringify(logEntry) + '\n';

    // Append to log file (create if doesn't exist)
    try {
      writeFileSync(logFile, logLine, { flag: 'a' });
    } catch {
      // If write fails, try to create the file first
      writeFileSync(logFile, logLine);
    }
  } catch (error) {
    // Don't throw - logging should not break the main operation
    console.error(
      `Failed to write to activity log: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Remove files that are now ignored by .gitignore from git tracking
 */
export function removeIgnoredFilesFromTracking(storagePath: string): void {
  try {
    // Get list of tracked files that are now ignored
    const { stdout: ignoredTracked } = gitCommand(
      storagePath,
      'ls-files',
      '-i',
      '-c',
      '--exclude-standard'
    );

    if (ignoredTracked.trim()) {
      const filesToRemove = ignoredTracked
        .trim()
        .split('\n')
        .filter((file) => file.trim());

      if (filesToRemove.length > 0) {
        // Remove files from git tracking but keep them in working directory
        gitCommand(storagePath, 'rm', '--cached', ...filesToRemove);

        // Auto-commit the removal
        autoCommit(storagePath, `Remove ${filesToRemove.length} files now ignored by .gitignore`);

        logger.info(
          `Removed ${filesToRemove.length} ignored files from git tracking:`,
          filesToRemove
        );
      }
    }
  } catch (error) {
    // Don't fail if this operation fails - it's not critical
    console.warn(
      `Failed to remove ignored files from tracking: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Ensure the storage folder has a .gitignore that excludes system files and logs
 */
export function ensureLogGitignore(storagePath: string): void {
  try {
    const gitignoreFile = join(storagePath, '.gitignore');
    const gitignoreContent = `# Activity logs
activity.log

# System files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Temporary files
*.tmp
*.temp
*~
`;

    if (!existsSync(gitignoreFile)) {
      // Create .gitignore with complete content
      writeFileSync(gitignoreFile, gitignoreContent);
    } else {
      // Check if .gitignore contains all required entries
      const content = readFileSync(gitignoreFile, 'utf8');
      const requiredEntries = ['activity.log', '.DS_Store', '*.tmp', '*.temp'];

      const missingEntries = requiredEntries.filter((entry) => !content.includes(entry));

      if (missingEntries.length > 0) {
        // Update .gitignore with complete content
        writeFileSync(
          gitignoreFile,
          content + (content.endsWith('\n') ? '' : '\n') + gitignoreContent
        );
      }
    }
  } catch (error) {
    console.error(
      `Failed to update .gitignore for activity log: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================
// ASYNC VERSIONS OF FUNCTIONS
// ============================================

/**
 * Async version of gitCommand.
 * Execute a git command with isolated credentials and secure argument handling.
 */
export async function gitCommandAsync(
  repoPath: string,
  ...args: string[]
): Promise<{ stdout: string; stderr: string }> {
  // Validate repository path
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('Invalid repository path');
  }

  // Validate each git argument for security
  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new Error('Invalid git argument: all arguments must be strings');
    }

    // Check for dangerous characters that could enable command injection
    if (
      arg.includes(';') ||
      arg.includes('&') ||
      arg.includes('|') ||
      arg.includes('`') ||
      arg.includes('$') ||
      arg.includes('\n') ||
      arg.includes('\r') ||
      arg.includes('\0')
    ) {
      throw new Error(`Invalid git argument: dangerous characters detected in "${arg}"`);
    }

    // Prevent extremely long arguments (DoS prevention)
    if (arg.length > 1000) {
      throw new Error('Invalid git argument: argument too long');
    }
  }

  // Build secure command array with git configuration
  const gitArgs = [
    '-c',
    'user.name=Knowledge MCP Server',
    '-c',
    'user.email=knowledge-mcp@localhost',
    ...args,
  ];

  return new Promise((resolve, reject) => {
    // Use spawn for safer argument handling (consistent with sync version)
    const child = spawn('git', gitArgs, {
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number) => {
      if (code !== 0) {
        reject(
          new Error(`Git command failed with exit code ${code}: ${stderr || 'Unknown error'}`)
        );
      } else {
        resolve({ stdout: stdout || '', stderr: stderr || '' });
      }
    });

    child.on('error', (error: Error) => {
      reject(error);
    });
  });
}

/**
 * Async version of initializeStorage.
 * Initialize storage directory and git repository.
 */
export async function initializeStorageAsync(storagePath: string): Promise<void> {
  // Create directory if it doesn't exist
  await mkdir(storagePath, { recursive: true });

  // Check if git repo already exists
  const gitDir = join(storagePath, '.git');
  const gitExists = await access(gitDir)
    .then(() => true)
    .catch(() => false);

  // Ensure .gitignore exists and is up to date (for both new and existing repos)
  await ensureLogGitignoreAsync(storagePath);

  // For existing repos, pull from remote first if configured, then handle ignored files
  if (gitExists) {
    // Pull from remote if configured to sync with latest changes
    await pullFromOriginAsync(storagePath);

    // Remove any newly ignored files from git tracking
    await removeIgnoredFilesFromTrackingAsync(storagePath);
    return;
  }

  // Initialize git repository
  await exec('git init', { cwd: storagePath });

  // Create initial commit if repository is empty
  try {
    await exec('git rev-parse HEAD', { cwd: storagePath });
  } catch {
    // No commits yet, create initial commit
    const readmePath = join(storagePath, 'README.md');
    await writeFile(
      readmePath,
      '# Knowledge MCP Storage\n\nThis directory contains project knowledge managed by Knowledge MCP Server.\n'
    );

    await gitCommandAsync(storagePath, 'add', 'README.md');
    await gitCommandAsync(storagePath, 'commit', '-m', 'Initial commit');
  }
}

/**
 * Async version of hasGitRemote.
 * Check if git remote "origin" exists in the repository.
 */
export async function hasGitRemoteAsync(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await gitCommandAsync(repoPath, 'remote', 'get-url', 'origin');
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Async version of pushToOrigin.
 * Push changes to origin/main.
 */
export async function pushToOriginAsync(repoPath: string): Promise<void> {
  try {
    await gitCommandAsync(repoPath, 'push', 'origin', 'main');
  } catch (error) {
    // Log error but don't fail the operation
    console.error(`Git push failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Async version of pullFromOrigin.
 * Pull changes from origin/main.
 * Performs a hard reset to avoid merge conflicts.
 */
export async function pullFromOriginAsync(repoPath: string): Promise<void> {
  try {
    // Only pull if remote exists
    if (!(await hasGitRemoteAsync(repoPath))) {
      // eslint-disable-next-line no-console
      logger.info('No git remote configured, skipping pull');
      return;
    }

    // eslint-disable-next-line no-console
    logger.info('Pulling latest changes from origin/main...');

    // Fetch latest changes from remote
    await gitCommandAsync(repoPath, 'fetch', 'origin', 'main');

    // Hard reset to match remote (overwrites local changes)
    await gitCommandAsync(repoPath, 'reset', '--hard', 'origin/main');

    // eslint-disable-next-line no-console
    logger.info('Successfully pulled and reset to origin/main');
  } catch (error) {
    // Log warning but don't fail the operation
    console.warn(`Git pull failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Async version of autoCommit.
 * Automatically commit all changes in the repository.
 */
export async function autoCommitAsync(repoPath: string, message: string): Promise<void> {
  try {
    // Stage all changes
    await gitCommandAsync(repoPath, 'add', '-A');

    // Check if there are changes to commit
    const { stdout } = await gitCommandAsync(repoPath, 'status', '--porcelain');

    if (stdout.trim()) {
      // Commit changes
      await gitCommandAsync(repoPath, 'commit', '-m', message);

      // Push to origin if it exists
      if (await hasGitRemoteAsync(repoPath)) {
        await pushToOriginAsync(repoPath);
      }
    }
  } catch (error) {
    // Log error but don't fail the operation
    console.error(
      `Git auto-commit failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Async version of readProjectIndex.
 * Read the project index mapping original names to slugified directories.
 */
export async function readProjectIndexAsync(storagePath: string): Promise<Record<string, string>> {
  const indexFile = join(storagePath, 'index.json');

  try {
    await access(indexFile);
    const content = await readFile(indexFile, 'utf8');
    const data = JSON.parse(content) as ProjectIndex;
    return data.projects && typeof data.projects === 'object' ? data.projects : {};
  } catch {
    // If index doesn't exist or is corrupted, return empty dict
    return {};
  }
}

/**
 * Internal function to write project index without acquiring index lock
 * Used when index lock is already acquired by the caller
 */
async function writeProjectIndexInternal(
  storagePath: string,
  index: Record<string, string>
): Promise<void> {
  const indexFile = join(storagePath, 'index.json');
  
  try {
    // Write to temporary file first with unique name to avoid conflicts
    const tempFile = `${indexFile}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
    await writeFile(tempFile, JSON.stringify({ projects: index }, null, 2));

    // Atomic rename
    await rename(tempFile, indexFile);

    // Commit the index change
    await autoCommitAsync(storagePath, 'Update project index');
  } catch (error) {
    // Clean up temp files on error (use a pattern to clean any temp files)
    const dir = dirname(indexFile);
    const indexName = 'index.json';

    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(dir);
      await Promise.all(
        files
          .filter((f) => f.startsWith(`${indexName}.tmp.`))
          .map(async (f) => {
            try {
              await unlink(join(dir, f));
            } catch {
              // Ignore cleanup errors
            }
          })
      );
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}

/**
 * Async version of writeProjectIndex.
 * Write the project index mapping.
 */
export async function writeProjectIndexAsync(
  storagePath: string,
  index: Record<string, string>
): Promise<void> {
  return acquireIndexLock(storagePath, async () => {
    await writeProjectIndexInternal(storagePath, index);
  });
}

/**
 * Async version of getProjectDirectory.
 * Get the directory path for a project without creating new entries.
 */
export async function getProjectDirectoryAsync(
  storagePath: string,
  projectId: string
): Promise<[string, string] | null> {
  // Read current index
  const index = await readProjectIndexAsync(storagePath);

  // Check if we already have a directory for this project
  if (index[projectId]) {
    const projectPath = join(storagePath, 'projects', index[projectId]);
    return [projectId, projectPath];
  }

  // Project doesn't exist - return null instead of creating entry
  return null;
}

/**
 * Async version of createProjectEntry.
 * Create a new project entry in the index and return its directory path.
 */
export async function createProjectEntryAsync(
  storagePath: string,
  projectId: string
): Promise<[string, string]> {
  return acquireIndexLock(storagePath, async () => {
    // Read current index
    const index = await readProjectIndexAsync(storagePath);

    // Check if we already have a directory for this project
    if (index[projectId]) {
      const projectPath = join(storagePath, 'projects', index[projectId]);
      return [projectId, projectPath];
    }

    // Create a new slugified directory name
    const slugifiedName = slugify(projectId);
    let dirName = slugifiedName;
    let counter = 1;

    // Handle collisions
    while (Object.values(index).includes(dirName)) {
      dirName = `${slugifiedName}-${counter}`;
      counter++;
    }

    // Update index
    index[projectId] = dirName;
    await writeProjectIndexInternal(storagePath, index);

    // Note: We don't create the directory here - let the caller do that
    const projectPath = join(storagePath, 'projects', dirName);

    return [projectId, projectPath];
  });
}

/**
 * Async version of logActivity.
 * Log activity to a file for debugging/auditing.
 */
export async function logActivityAsync(
  storagePath: string,
  method: string,
  params: Record<string, unknown>
): Promise<void> {
  try {
    const logFile = join(storagePath, 'activity.log');
    const timestamp = new Date().toISOString();

    // Extract known fields from params to create a flat structure
    const {
      success,
      project_id,
      filename,
      chapter_title,
      section_header,
      error,
      traceId,
      duration,
      ...otherParams
    } = params;

    const logEntry: MethodLogEntry = {
      timestamp,
      method,
      success: (success as boolean) ?? true,
      ...(project_id ? { project_id: project_id as string } : {}),
      ...(filename ? { filename: filename as string } : {}),
      ...(chapter_title ? { chapter_title: chapter_title as string } : {}),
      ...(section_header ? { section_header: section_header as string } : {}),
      ...(error ? { error: error as string } : {}),
      ...(traceId ? { traceId: traceId as string } : {}),
      ...(duration !== undefined ? { duration: duration as number } : {}),
      // Include any other params that don't fit the standard structure
      ...(Object.keys(otherParams).length > 0 ? { params: otherParams } : {}),
    };
    const logLine = JSON.stringify(logEntry) + '\n';

    // Check if file exists
    try {
      await access(logFile);
      await writeFile(logFile, logLine, { flag: 'a' });
    } catch {
      // File doesn't exist, create it
      await writeFile(logFile, logLine);
    }
  } catch (error) {
    // Silently fail for logging errors
    console.error(
      `Failed to log activity: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Async version of removeIgnoredFilesFromTracking.
 * Remove files that are now ignored by .gitignore from git tracking
 */
export async function removeIgnoredFilesFromTrackingAsync(storagePath: string): Promise<void> {
  try {
    // Get list of tracked files that are now ignored
    const { stdout: ignoredTracked } = await gitCommandAsync(
      storagePath,
      'ls-files',
      '-i',
      '-c',
      '--exclude-standard'
    );

    if (ignoredTracked.trim()) {
      const filesToRemove = ignoredTracked
        .trim()
        .split('\n')
        .filter((file) => file.trim());

      if (filesToRemove.length > 0) {
        // Remove files from git tracking but keep them in working directory
        await gitCommandAsync(storagePath, 'rm', '--cached', ...filesToRemove);

        // Auto-commit the removal
        await autoCommitAsync(
          storagePath,
          `Remove ${filesToRemove.length} files now ignored by .gitignore`
        );

        logger.info(
          `Removed ${filesToRemove.length} ignored files from git tracking:`,
          filesToRemove
        );
      }
    }
  } catch (error) {
    // Don't fail if this operation fails - it's not critical
    console.warn(
      `Failed to remove ignored files from tracking: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Async version of ensureLogGitignore.
 * Ensure system files and logs are in .gitignore.
 */
export async function ensureLogGitignoreAsync(storagePath: string): Promise<void> {
  try {
    const gitignoreFile = join(storagePath, '.gitignore');
    const gitignoreContent = `# Activity logs
activity.log

# System files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Temporary files
*.tmp
*.temp
*~
`;

    try {
      await access(gitignoreFile);
      // File exists, check if it contains all required entries
      const content = await readFile(gitignoreFile, 'utf8');
      const requiredEntries = ['activity.log', '.DS_Store', '*.tmp', '*.temp'];

      const missingEntries = requiredEntries.filter((entry) => !content.includes(entry));

      if (missingEntries.length > 0) {
        // Update .gitignore with complete content
        await writeFile(
          gitignoreFile,
          content + (content.endsWith('\n') ? '' : '\n') + gitignoreContent
        );
      }
    } catch {
      // File doesn't exist, create it with complete content
      await writeFile(gitignoreFile, gitignoreContent);
    }
  } catch (error) {
    console.error(
      `Failed to update .gitignore for activity log: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
