import { SERVER_CONFIG, STORAGE_PATH } from '../config/index.js';
import { MCPError, MCPErrorCode } from '../errors/index.js';
import { gitCommand, autoCommit, hasGitRemote, pushToOrigin } from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

export class ServerToolHandler extends BaseHandler {
  /**
   * Get server information including version and storage path.
   */
  getServerInfo(): string {
    const context = this.createContext('get_server_info', {});

    try {
      const result = {
        name: SERVER_CONFIG.name,
        version: SERVER_CONFIG.version,
        storage_path: STORAGE_PATH,
        description:
          'Knowledge MCP Server - Centralized project knowledge management via Model Context Protocol',
      };

      this.logSuccess('get_server_info', {}, context);
      return this.formatSuccessResponse(result);
    } catch (error) {
      this.logError(
        'get_server_info',
        {},
        error instanceof MCPError ? error : String(error),
        context
      );
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Get git status of the knowledge datastore.
   */
  getStorageStatus(): string {
    const context = this.createContext('get_storage_status', {});

    try {
      // Get git status
      const { stdout: statusOutput } = gitCommand(STORAGE_PATH, 'status', '--porcelain');
      const hasChanges = statusOutput.trim().length > 0;

      // Get current branch
      const { stdout: branchOutput } = gitCommand(STORAGE_PATH, 'branch', '--show-current');
      const currentBranch = branchOutput.trim();

      // Get last commit info
      let lastCommit = 'No commits yet';
      try {
        const { stdout: logOutput } = gitCommand(
          STORAGE_PATH,
          'log',
          '-1',
          '--pretty=format:%h - %s (%cr)'
        );
        if (logOutput.trim()) {
          lastCommit = logOutput.trim();
        }
      } catch {
        // No commits yet
      }

      // Check if remote exists
      const hasRemote = hasGitRemote(STORAGE_PATH);

      // Get remote status if available
      let remoteStatus = 'No remote configured';
      if (hasRemote) {
        try {
          const { stdout: remoteOutput } = gitCommand(STORAGE_PATH, 'remote', 'get-url', 'origin');
          remoteStatus = `Remote: ${remoteOutput.trim()}`;

          // Check if we're ahead/behind
          try {
            const { stdout: revListOutput } = gitCommand(
              STORAGE_PATH,
              'rev-list',
              '--count',
              '--left-right',
              'HEAD...origin/main'
            );
            const [ahead, behind] = revListOutput
              .trim()
              .split('\t')
              .map((n) => parseInt(n, 10));
            if (ahead > 0 || behind > 0) {
              remoteStatus += ` (${ahead} ahead, ${behind} behind)`;
            }
          } catch {
            // Can't determine ahead/behind status
          }
        } catch {
          // Error getting remote URL
        }
      }

      const result = {
        storage_path: STORAGE_PATH,
        has_changes: hasChanges,
        current_branch: currentBranch,
        last_commit: lastCommit,
        remote_status: remoteStatus,
        uncommitted_files: statusOutput.trim() ? statusOutput.trim().split('\n').length : 0,
        status_details: statusOutput.trim() || 'Working tree clean',
      };

      this.logSuccess('get_storage_status', {}, context);
      return this.formatSuccessResponse(result);
    } catch (error) {
      const mcpError = new MCPError(
        MCPErrorCode.GIT_ERROR,
        `Failed to get storage status: ${error instanceof Error ? error.message : String(error)}`,
        { traceId: context.traceId }
      );
      this.logError('get_storage_status', {}, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Force sync the storage by committing all changes and pushing to origin.
   */
  syncStorage(): string {
    const context = this.createContext('sync_storage', {});

    try {
      // Get current status before sync
      const { stdout: beforeStatus } = gitCommand(STORAGE_PATH, 'status', '--porcelain');
      const hasChanges = beforeStatus.trim().length > 0;

      if (!hasChanges) {
        // No changes to sync
        const result = {
          message: 'No changes to sync - working tree clean',
          files_committed: 0,
          pushed: false,
        };
        this.logSuccess('sync_storage', result, context);
        return this.formatSuccessResponse(result);
      }

      // Count files to be committed
      const filesCount = beforeStatus.trim().split('\n').length;

      // Perform auto-commit with a descriptive message
      const timestamp = new Date().toISOString();
      const commitMessage = `Sync storage: ${filesCount} file${filesCount > 1 ? 's' : ''} updated at ${timestamp}`;
      autoCommit(STORAGE_PATH, commitMessage);

      // Check if push was successful
      const hasRemote = hasGitRemote(STORAGE_PATH);
      let pushed = false;
      let pushError: string | undefined;

      if (hasRemote) {
        try {
          pushToOrigin(STORAGE_PATH);
          pushed = true;
        } catch (error) {
          pushError = error instanceof Error ? error.message : String(error);
        }
      }

      const result = {
        message: `Successfully committed ${filesCount} file${filesCount > 1 ? 's' : ''}`,
        files_committed: filesCount,
        pushed,
        push_error: pushError,
        commit_message: commitMessage,
      };

      this.logSuccess('sync_storage', { files_committed: filesCount, pushed }, context);
      return this.formatSuccessResponse(result);
    } catch (error) {
      const mcpError = new MCPError(
        MCPErrorCode.GIT_ERROR,
        `Failed to sync storage: ${error instanceof Error ? error.message : String(error)}`,
        { traceId: context.traceId }
      );
      this.logError('sync_storage', {}, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }
}
