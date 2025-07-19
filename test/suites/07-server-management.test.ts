#!/usr/bin/env tsx

import { access, readFile } from 'fs/promises';
import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import {
  TestRunner,
  assertSuccess,
  assertContains,
  assertEqual,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-server'));
const SERVER_PATH = resolve('./dist/knowledge-mcp/index.js');

async function main(): Promise<void> {
  const runner = new TestRunner();
  const client = new MCPTestClient({
    serverPath: SERVER_PATH,
    storagePath: TEST_STORAGE_PATH,
  });

  // Setup
  setupTestEnvironment(TEST_STORAGE_PATH);
  await client.connect();
  client.setTestRunner(runner);
  try {
    runner.setSuite('Server Management Operations', 'System Operations');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    await runner.runTest('get_server_info: Basic server information', async () => {
      const result = await client.callToolAndParse('get_server_info', {});

      assertSuccess(result);

      // Check required fields
      const name = result.name as string;
      if (!name || typeof name !== 'string') {
        throw new Error('Server name missing');
      }

      // Version should be semver format
      const version = result.version as string;
      if (!version.match(/^\d+\.\d+\.\d+/)) {
        throw new Error(`Invalid version format: ${version}`);
      }

      // Should have storage path
      assertEqual(result.storage_path, TEST_STORAGE_PATH);

      // Should have description
      if (!result.description) {
        throw new Error('Server description missing');
      }
    });

    await runner.runTest('get_storage_status: Initial git status', async () => {
      const result = await client.callToolAndParse('get_storage_status', {});

      assertSuccess(result);

      // Check required fields
      assertEqual(result.storage_path, TEST_STORAGE_PATH);

      // Should have git info
      if (!result.current_branch) {
        throw new Error('Git branch information missing');
      }

      // Initial state might have changes from setup
      assertEqual(typeof result.has_changes, 'boolean');
      assertEqual(typeof result.uncommitted_files, 'number');
    });

    await runner.runTest('get_storage_status: After creating content', async () => {
      const projectId = generateTestProjectId('status');

      // Create some content
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Test Project\n\nTesting storage status.',
      });

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc',
        title: 'Test Document',
        introduction: 'Test intro',
        keywords: ['test'],
        chapters: [{ title: 'Chapter', content: 'Content' }],
      });

      // Check status again - should show no changes (auto-commit)
      const result = await client.callToolAndParse('get_storage_status', {});

      assertSuccess(result);

      // Auto-commit should keep it clean
      assertEqual(result.has_changes, false);
      assertEqual(result.uncommitted_files, 0);

      // Should have commits
      if (!result.last_commit || result.last_commit === 'No commits yet') {
        throw new Error('Expected commits after creating content');
      }
    });

    await runner.runTest('sync_storage: Manual sync operation', async () => {
      const projectId = generateTestProjectId('sync');

      // Create content
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Sync Test\n\nTesting manual sync.',
      });

      // Force sync
      const result = await client.callToolAndParse('sync_storage', {});

      assertSuccess(result);

      // Should have a message
      const message = result.message as string;
      if (!message || typeof message !== 'string') {
        throw new Error('Sync message missing');
      }

      // Files committed should be 0 (already auto-committed)
      assertEqual(result.files_committed, 0);

      // Commit message might not exist if no changes
      if (result.commit_message) {
        const commitMessage = result.commit_message as string;
        if (typeof commitMessage !== 'string') {
          throw new Error('Invalid commit message type');
        }
      }
    });

    await runner.runTest('Server storage: Verify git repository structure', async () => {
      // Check that git repo is properly initialized
      const gitDir = join(TEST_STORAGE_PATH, '.git');
      try {
        await access(gitDir);
      } catch {
        throw new Error('Git repository not initialized');
      }

      // Check for required files
      const requiredFiles = ['.gitignore', 'index.json'];
      for (const file of requiredFiles) {
        const filePath = join(TEST_STORAGE_PATH, file);
        try {
          await access(filePath);
        } catch {
          throw new Error(`Required file missing: ${file}`);
        }
      }

      // activity.log should exist but be gitignored
      const activityLog = join(TEST_STORAGE_PATH, 'activity.log');
      try {
        await access(activityLog);
        // Check it's in .gitignore
        const gitignorePath = join(TEST_STORAGE_PATH, '.gitignore');
        const gitignoreContent = await readFile(gitignorePath, 'utf8');
        assertContains(gitignoreContent, 'activity.log');
      } catch {
        // activity.log might not exist yet, which is fine
      }
    });

    await runner.runTest('Server operations: Concurrent project creation', async () => {
      // Create multiple projects concurrently
      const projectIds = Array.from({ length: 5 }, (_, i) =>
        generateTestProjectId(`concurrent-${i}`)
      );

      const promises = projectIds.map((projectId) =>
        client.callToolAndParse('update_project_main', {
          project_id: projectId,
          content: `# Project ${projectId}\n\nConcurrent creation test.`,
        })
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result, i) => {
        assertSuccess(result, `Project ${i} failed`);
      });

      // Verify all projects exist
      for (const projectId of projectIds) {
        const getResult = await client.callToolAndParse('get_project_main', {
          project_id: projectId,
        });
        assertSuccess(getResult);
        assertEqual(getResult.exists, true);
      }
    });

    await runner.runTest('Server persistence: Data survives restart', async () => {
      const projectId = generateTestProjectId('persist');
      const content = '# Persistence Test\n\nThis should survive restart.';

      // Create content
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'persist-doc',
        title: 'Persistent Document',
        introduction: 'Should survive restart',
        keywords: ['persist'],
        chapters: [{ title: 'Data', content: 'Persistent data' }],
      });

      // Ensure all changes are committed before disconnect
      await client.callToolAndParse('sync_storage', {});

      // Disconnect and reconnect
      await client.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await client.connect();
      client.setTestRunner(runner);
      // Verify data still exists
      const mainResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertEqual(mainResult.exists, true);
      assertEqual(mainResult.content, content);

      const fileResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'persist-doc.md',
      });
      assertSuccess(fileResult);
      assertEqual((fileResult.document as any).metadata.title, 'Persistent Document');
    });

    await runner.runTest('get_storage_status: Remote status information', async () => {
      const result = await client.callToolAndParse('get_storage_status', {});

      assertSuccess(result);

      // Should have remote status field
      if (result.remote_status === undefined) {
        throw new Error('Remote status field missing');
      }

      // Remote status should indicate no remote or explain status
      const remoteStatus = result.remote_status as string;
      if (!remoteStatus.includes('No remote') && !remoteStatus.includes('up to date')) {
        throw new Error(`Unexpected remote status: ${remoteStatus}`);
      }
    });

    await runner.runTest('Server cleanup: Delete project', async () => {
      const projectId = generateTestProjectId('cleanup');

      // Create project with content
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Cleanup Test',
      });

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'cleanup-doc',
        title: 'Cleanup Document',
        introduction: 'To be deleted',
        keywords: ['cleanup'],
        chapters: [{ title: 'Chapter', content: 'Content' }],
      });

      // Delete the project
      const deleteResult = await client.callToolAndParse('delete_project', {
        project_id: projectId,
      });

      assertSuccess(deleteResult);
      assertEqual(deleteResult.project_id, projectId);

      // Verify it's gone
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertEqual(getResult.exists, false);

      // Knowledge file should also be inaccessible
      const fileResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'cleanup-doc.md',
      });
      assertEqual(fileResult.success, false);
    });

    await runner.runTest('Server robustness: Handle invalid storage path gracefully', async () => {
      // Try operations that might fail gracefully
      const projectId = 'test-project-' + Date.now();

      // Normal operation should work
      const result = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Test\n\nContent',
      });

      assertSuccess(result);

      // Server should handle edge cases gracefully
      const statusResult = await client.callToolAndParse('get_storage_status', {});
      assertSuccess(statusResult);
    });
  } finally {
    await client.disconnect();
    cleanupTestEnvironment(TEST_STORAGE_PATH);

    // Export detailed results for HTML reporting
    const detailedSuiteResult = runner.getDetailedSuiteResult();
    if (process.env.EXPORT_DETAILED_RESULTS) {
      const { writeFileSync, mkdirSync } = await import('fs');
      const path = await import('path');
      const resultsDir = path.resolve('./test-results/detailed-suites');
      mkdirSync(resultsDir, { recursive: true });
      const resultPath = path.resolve(resultsDir, '07-server-management.test.json');
      writeFileSync(resultPath, JSON.stringify(detailedSuiteResult, null, 2));
    }

    runner.printSummary();
    runner.exitWithResults();
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}
