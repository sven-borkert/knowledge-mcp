#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import {
  TestRunner,
  assertFailure,
  assertContains,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-errors'));
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
    runner.setSuite('Error Handling Scenarios', 'Error Handling');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    // Input validation errors
    await runner.runTest('Invalid input: Empty project_id', async () => {
      try {
        await client.callToolAndParse('get_project_main', {
          project_id: '',
        });
        throw new Error('Expected validation error');
      } catch (error) {
        assertContains((error as Error).message, 'Project ID cannot be empty');
      }
    });

    await runner.runTest('Invalid input: Missing required parameters', async () => {
      try {
        // Try to create knowledge file without required fields
        await client.callToolAndParse('create_knowledge_file', {
          project_id: generateTestProjectId('missing-params'),
          filename: 'test',
          // Missing: title, introduction, keywords, chapters
        });
        throw new Error('Expected validation error');
      } catch (error) {
        assertContains((error as Error).message, 'Required');
      }
    });

    await runner.runTest('Invalid input: Wrong parameter types', async () => {
      try {
        await client.callToolAndParse('add_todo_task', {
          project_id: generateTestProjectId('wrong-types'),
          todo_number: 'not-a-number' as any, // Should be number
          description: 'Task',
        });
        throw new Error('Expected validation error');
      } catch (error) {
        assertContains((error as Error).message, 'Expected number, received string');
      }
    });

    // File operation errors
    await runner.runTest('File not found: Non-existent knowledge file', async () => {
      const projectId = generateTestProjectId('file-not-found');

      const result = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'non-existent.md',
      });

      assertFailure(result);
      assertContains(result.error as string, 'not found');
    });

    await runner.runTest('File not found: Update non-existent chapter', async () => {
      const projectId = generateTestProjectId('chapter-not-found');

      // Create a knowledge file
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc',
        title: 'Test Document',
        introduction: 'Test',
        keywords: ['test'],
        chapters: [{ title: 'Chapter 1', content: 'Content' }],
      });

      // Try to update non-existent chapter
      const result = await client.callToolAndParse('update_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Non-existent Chapter',
        new_content: 'New content',
      });

      assertFailure(result);
      assertContains(result.error as string, 'not found');
    });

    // Duplicate/conflict errors
    await runner.runTest('Duplicate error: Create existing knowledge file', async () => {
      const projectId = generateTestProjectId('duplicate-file');

      // Create first file
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'duplicate-test',
        title: 'Original',
        introduction: 'Original',
        keywords: ['test'],
        chapters: [{ title: 'Chapter', content: 'Content' }],
      });

      // Try to create again with same filename
      const result = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'duplicate-test',
        title: 'Duplicate',
        introduction: 'Duplicate',
        keywords: ['duplicate'],
        chapters: [{ title: 'Chapter', content: 'Content' }],
      });

      assertFailure(result);
      assertContains(result.error as string, 'already exists');
    });

    await runner.runTest('Duplicate error: Add existing section', async () => {
      const projectId = generateTestProjectId('duplicate-section');

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Project\n\n## Existing Section\nContent',
      });

      const result = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Existing Section',
        content: 'Duplicate content',
        position: 'end',
      });

      assertFailure(result);
      assertContains(result.error as string, 'already exists');
    });

    await runner.runTest('Duplicate error: Add existing chapter', async () => {
      const projectId = generateTestProjectId('duplicate-chapter');

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'test',
        title: 'Test',
        introduction: 'Test',
        keywords: ['test'],
        chapters: [{ title: 'Existing Chapter', content: 'Content' }],
      });

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test.md',
        chapter_title: 'Existing Chapter',
        content: 'Duplicate',
        position: 'end',
      });

      assertFailure(result);
      assertContains(result.error as string, 'already exists');
    });

    // Invalid position/target errors
    await runner.runTest('Invalid target: Add section with non-existent target', async () => {
      const projectId = generateTestProjectId('invalid-target-section');

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Project\n\n## Only Section\nContent',
      });

      const result = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## New Section',
        content: 'Content',
        position: 'before',
        reference_header: '## Non-existent Section', // Changed from target_section
      });

      assertFailure(result);
      assertContains(result.error as string, 'not found');
    });

    await runner.runTest('Invalid target: Add chapter with non-existent target', async () => {
      const projectId = generateTestProjectId('invalid-target-chapter');

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'test',
        title: 'Test',
        introduction: 'Test',
        keywords: ['test'],
        chapters: [{ title: 'Only Chapter', content: 'Content' }],
      });

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test.md',
        chapter_title: 'New Chapter',
        content: 'Content',
        position: 'after',
        reference_chapter: 'Non-existent Chapter', // Changed from target_chapter
      });

      assertFailure(result);
    });

    // Edge case errors
    await runner.runTest('Empty content errors', async () => {
      const projectId = generateTestProjectId('empty-content');

      // Empty keywords array
      try {
        await client.callToolAndParse('create_knowledge_file', {
          project_id: projectId,
          filename: 'empty-keywords',
          title: 'Test',
          introduction: 'Test',
          keywords: [],
          chapters: [{ title: 'Chapter', content: 'Content' }],
        });
        throw new Error('Expected validation error');
      } catch (error) {
        assertContains((error as Error).message, 'at least 1 element');
      }

      // Empty chapter title
      try {
        await client.callToolAndParse('create_knowledge_file', {
          project_id: projectId,
          filename: 'empty-chapter-title',
          title: 'Test',
          introduction: 'Test',
          keywords: ['test'],
          chapters: [{ title: '', content: 'Content' }],
        });
        throw new Error('Expected validation error');
      } catch (error) {
        assertContains((error as Error).message, 'Chapter title cannot be empty');
      }
    });

    await runner.runTest('Invalid characters in identifiers', async () => {
      try {
        // Invalid characters in project_id (if any validation exists)
        await client.callToolAndParse('get_project_main', {
          project_id: '../../../etc/passwd', // Path traversal attempt
        });
        throw new Error('Expected validation error for path traversal');
      } catch (error) {
        assertContains((error as Error).message, 'path traversal');
      }
    });

    // Operation-specific errors
    await runner.runTest('TODO errors: Invalid operations', async () => {
      const projectId = generateTestProjectId('todo-errors');

      // Complete non-existent task
      let result = await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 999,
        task_number: 1,
      });

      assertFailure(result);

      // Remove task from non-existent TODO
      result = await client.callToolAndParse('remove_todo_task', {
        project_id: projectId,
        todo_number: 999,
        task_number: 1,
      });

      assertFailure(result);

      // Get tasks from non-existent TODO
      result = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 999,
      });

      assertFailure(result);
    });

    await runner.runTest('Search errors: Invalid query handling', async () => {
      const projectId = generateTestProjectId('search-errors');

      // Empty search query
      try {
        await client.callToolAndParse('search_knowledge', {
          project_id: projectId,
          query: '',
        });
        throw new Error('Expected validation error');
      } catch (error) {
        assertContains((error as Error).message, 'Search query cannot be empty');
      }
    });

    await runner.runTest('Malformed markdown handling', async () => {
      const projectId = generateTestProjectId('malformed');

      // Create project with malformed sections
      const malformedContent = `# Project

## Section 1
Content 1

### Subsection
Sub content

## Section 2
Content 2

# Another H1 (should not break parsing)
More content`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: malformedContent,
      });

      // Try to update a section - should handle gracefully
      const result = await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Section 2',
        new_content: 'Updated content',
      });

      // Should either succeed or fail gracefully
      if (!result.success && !result.error) {
        throw new Error('Invalid error response structure');
      }
    });

    await runner.runTest('Concurrent operation conflicts', async () => {
      const projectId = generateTestProjectId('concurrent');

      // Create initial state
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'concurrent-test',
        title: 'Concurrent Test',
        introduction: 'Testing concurrent operations',
        keywords: ['test'],
        chapters: [
          { title: 'Chapter 1', content: 'Content 1' },
          { title: 'Chapter 2', content: 'Content 2' },
        ],
      });

      // Simulate concurrent operations
      const promises = [
        client.callToolAndParse('update_chapter', {
          project_id: projectId,
          filename: 'concurrent-test.md',
          chapter_title: 'Chapter 1',
          new_content: 'Updated by operation 1',
        }),
        client.callToolAndParse('update_chapter', {
          project_id: projectId,
          filename: 'concurrent-test.md',
          chapter_title: 'Chapter 2',
          new_content: 'Updated by operation 2',
        }),
        client.callToolAndParse('add_chapter', {
          project_id: projectId,
          filename: 'concurrent-test.md',
          chapter_title: 'Chapter 3',
          content: 'Added by operation 3',
          position: 'end',
        }),
      ];

      const results = await Promise.all(promises);

      // All operations should succeed or fail gracefully
      results.forEach((result, index) => {
        if (result.success === undefined) {
          throw new Error(`Operation ${index + 1} returned invalid response`);
        }
      });
    });

    await runner.runTest('Error response format consistency', async () => {
      // Test various error scenarios and check response format
      const errorScenarios = [
        // Non-existent project - returns exists: false, not an error
        async () => {
          const result = await client.callToolAndParse('get_project_main', {
            project_id: 'non-existent-' + Date.now(),
          });

          // This returns success: true with exists: false, which is correct behavior
          if (result.success !== true || result.exists !== false) {
            throw new Error('Expected success: true with exists: false for non-existent project');
          }
        },

        // Invalid parameters - should throw validation error
        async () => {
          try {
            await client.callToolAndParse('create_todo', {
              project_id: generateTestProjectId('format-test'),
              // Missing description
            });
            throw new Error('Expected validation error');
          } catch (error) {
            if (!(error as Error).message.includes('Required')) {
              throw new Error('Unexpected error type: ' + (error as Error).message);
            }
          }
        },

        // Operation on non-existent resource - should return normal error response
        async () => {
          const result = await client.callToolAndParse('delete_knowledge_file', {
            project_id: generateTestProjectId('format-test'),
            filename: 'non-existent.md',
          });

          if (result.success !== false || !result.error) {
            throw new Error('Expected error response with success: false');
          }
        },
      ];

      // Run all scenarios
      for (const scenario of errorScenarios) {
        await scenario();
      }
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
      const resultPath = path.resolve(resultsDir, '09-error-handling.json');
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
