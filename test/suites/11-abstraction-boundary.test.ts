#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import {
  TestRunner,
  assertSuccess,
  assertFailure,
  assertNotContains,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-abstraction-boundary'));
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
    runner.setSuite('Abstraction Boundary Security Tests', 'Security');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    // Test that project IDs with valid special characters don't leak internal folder names
    await runner.runTest('Security: Project ID with special characters', async () => {
      const projectId = 'test-project-trace-id-dollars';

      // Create project
      const createResult = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Test Project\n\nTesting abstraction boundary.',
      });

      assertSuccess(createResult);

      // Verify response only contains user-facing project ID
      const message = createResult.message as string;
      assertNotContains(message, 'test-project-trace-id-dollardollardollardollar');

      // Get project and verify response
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertSuccess(getResult);

      // Delete project and verify response
      const deleteResult = await client.callToolAndParse('delete_project', {
        project_id: projectId,
      });
      assertSuccess(deleteResult);

      const deleteMessage = deleteResult.message as string;
      assertNotContains(deleteMessage, 'test-project-trace-id-dollardollardollardollar');
    });

    // Test error messages don't leak internal paths
    await runner.runTest('Security: Error messages hide internal paths', async () => {
      const projectId = 'test-project-with-underscores';

      // Try to access non-existent project
      const result = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertSuccess(result); // Should return exists: false, not an error

      // Try to update non-existent section
      const sectionResult = await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Non-Existent Section',
        new_content: 'New content',
      });

      assertFailure(sectionResult);
      const errorMsg = sectionResult.error as string;

      // Error should mention the user-facing project ID
      assertNotContains(errorMsg, '/projects/'); // Shouldn't contain internal path structure
      assertNotContains(errorMsg, '.knowledge-mcp'); // Shouldn't contain storage path
    });

    // Test knowledge file operations don't leak paths
    await runner.runTest('Security: Knowledge file operations hide paths', async () => {
      const projectId = generateTestProjectId('knowledge-security');

      // Create project first
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Security Test Project',
      });

      // Create knowledge file
      const createResult = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'security-test',
        title: 'Security Test Document',
        introduction: 'Testing path security',
        keywords: ['security', 'test'],
        chapters: [{ title: 'Test Chapter', content: 'Test content' }],
      });

      assertSuccess(createResult);

      // Response should not contain internal paths
      const filepath = createResult.filepath as string;
      assertNotContains(filepath, TEST_STORAGE_PATH);
      assertNotContains(filepath, 'projects/');

      // Try to get non-existent knowledge file
      const getResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'non-existent.md',
      });

      assertFailure(getResult);
      const errorMsg = getResult.error as string;
      assertNotContains(errorMsg, TEST_STORAGE_PATH);
      assertNotContains(errorMsg, 'projects/');
    });

    // Test TODO operations don't leak paths
    await runner.runTest('Security: TODO operations hide paths', async () => {
      const projectId = generateTestProjectId('todo-security');

      // Create project first
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# TODO Security Test',
      });

      // Create TODO
      const createResult = await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Security test TODO',
        tasks: [
          { title: 'Task 1', content: 'First task description' },
          { title: 'Task 2', content: 'Second task description' },
        ],
      });

      assertSuccess(createResult);

      // Try to access non-existent TODO
      const getResult = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 999,
      });

      assertFailure(getResult);
      const errorMsg = getResult.error as string;
      assertNotContains(errorMsg, TEST_STORAGE_PATH);
      assertNotContains(errorMsg, 'projects/');
      assertNotContains(errorMsg, 'TODO/');
    });

    // Test search operations don't leak paths
    await runner.runTest('Security: Search operations hide paths', async () => {
      const projectId = generateTestProjectId('search-security');

      // Create project with knowledge
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Search Security Test',
      });

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'searchable-doc',
        title: 'Searchable Document',
        introduction: 'Document for search testing',
        keywords: ['searchable', 'test'],
        chapters: [{ title: 'Content', content: 'Some searchable content here' }],
      });

      // Search for content
      const searchResult = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'searchable',
      });

      assertSuccess(searchResult);

      // Verify results don't contain internal paths
      const results = searchResult.results as any[];
      if (results && results.length > 0) {
        for (const result of results) {
          if (result.file && typeof result.file === 'string') {
            const filename = result.file as string;
            assertNotContains(filename, TEST_STORAGE_PATH);
            assertNotContains(filename, 'projects/');
          }
        }
      }
    });

    // Test commit messages in auto-commit don't leak paths
    await runner.runTest('Security: Auto-commit messages use user-facing IDs', async () => {
      const projectId = 'test-commit-security-special';

      // Create project (triggers auto-commit)
      const result = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Commit Security Test',
      });

      assertSuccess(result);

      // The response message should use the original project ID
      const message = result.message as string;
      // The message should reference the original project ID, not internal slugified names
      assertNotContains(message, TEST_STORAGE_PATH);
      assertNotContains(message, 'projects/');
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
      const resultPath = path.resolve(resultsDir, '11-abstraction-boundary.json');
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
