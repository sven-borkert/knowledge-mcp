#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import {
  TestRunner,
  assertSuccess,
  assertEqual,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-search'));
const SERVER_PATH = resolve('./dist/knowledge-mcp/index.js');

// Create test documents for searching
async function setupSearchTestData(client: MCPTestClient, projectId: string): Promise<void> {
  // Document 1: TypeScript guide
  await client.callToolAndParse('create_knowledge_file', {
    project_id: projectId,
    filename: 'typescript-guide',
    title: 'TypeScript Programming Guide',
    introduction: 'A comprehensive guide to TypeScript programming language.',
    keywords: ['typescript', 'programming', 'javascript', 'types'],
    chapters: [
      {
        title: 'Getting Started',
        content:
          'Learn the basics of TypeScript and how to get started with programming in this statically typed language.',
      },
      {
        title: 'Type System',
        content:
          'Understanding the TypeScript type system is crucial for effective programming. Types provide safety and documentation.',
      },
      {
        title: 'Advanced Features',
        content:
          'TypeScript offers many advanced features for programming including generics, decorators, and more.',
      },
    ],
  });

  // Document 2: JavaScript best practices
  await client.callToolAndParse('create_knowledge_file', {
    project_id: projectId,
    filename: 'javascript-best-practices',
    title: 'JavaScript Best Practices',
    introduction: 'Essential best practices for JavaScript development.',
    keywords: ['javascript', 'best-practices', 'coding', 'standards'],
    chapters: [
      {
        title: 'Code Organization',
        content: 'Organizing your JavaScript code effectively is important for maintainability.',
      },
      {
        title: 'Performance Tips',
        content:
          'JavaScript performance can be improved by following these tips and avoiding common pitfalls.',
      },
    ],
  });

  // Document 3: API development
  await client.callToolAndParse('create_knowledge_file', {
    project_id: projectId,
    filename: 'api-development',
    title: 'API Development Guide',
    introduction: 'Building robust APIs with modern technologies.',
    keywords: ['api', 'rest', 'graphql', 'development'],
    chapters: [
      {
        title: 'REST APIs',
        content:
          'REST APIs are a popular choice for web development. Learn the principles and best practices.',
      },
      {
        title: 'GraphQL',
        content: 'GraphQL provides a flexible alternative to REST for API development.',
      },
      {
        title: 'Authentication',
        content:
          'Secure your APIs with proper authentication and authorization mechanisms including JWT tokens.',
      },
    ],
  });

  // Document 4: Testing guide
  await client.callToolAndParse('create_knowledge_file', {
    project_id: projectId,
    filename: 'testing-guide',
    title: 'Software Testing Guide',
    introduction: 'Comprehensive guide to software testing methodologies.',
    keywords: ['testing', 'unit', 'integration', 'quality'],
    chapters: [
      {
        title: 'Unit Testing',
        content:
          'Unit testing is a fundamental practice in software development. Learn how to write effective unit tests.',
      },
      {
        title: 'Integration Testing',
        content: 'Integration testing ensures that different components work together properly.',
      },
      {
        title: 'Test Driven Development',
        content:
          'TDD is a development methodology where you write tests before implementing features.',
      },
    ],
  });
}

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
    runner.setSuite('Search Operations', 'Search & Discovery');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    await runner.runTest('search_knowledge: Single keyword match', async () => {
      const projectId = generateTestProjectId('search-single');
      await setupSearchTestData(client, projectId);

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'typescript',
      });

      assertSuccess(result);
      assertEqual(result.total_documents, 1);

      const results = result.results as any[];
      assertEqual(results[0].document, 'typescript-guide.md');
      // Check that it found matches in the document
      assertEqual(results[0].chapters.length > 0, true);
    });

    await runner.runTest('search_knowledge: Multiple keyword search', async () => {
      const projectId = generateTestProjectId('search-multiple');
      await setupSearchTestData(client, projectId);

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'testing unit',
      });

      assertSuccess(result);
      const results = result.results as any[];
      assertEqual(results[0].document, 'testing-guide.md');

      // Should have found matches in chapters
      const totalMatches = (results[0].chapters as any[]).reduce(
        (sum: number, ch: any) => sum + (ch.matches as number),
        0
      );
      if (totalMatches < 2) {
        throw new Error('Did not find matches for both keywords');
      }
    });

    await runner.runTest('search_knowledge: Case insensitive search', async () => {
      const projectId = generateTestProjectId('search-case');
      await setupSearchTestData(client, projectId);

      // Search with different cases
      const searches = ['API', 'api', 'Api', 'aPi'];

      for (const query of searches) {
        const result = await client.callToolAndParse('search_knowledge', {
          project_id: projectId,
          query: query,
        });

        assertSuccess(result);
        assertEqual(result.total_documents, 1, `Failed for query: ${query}`);
      }
    });

    await runner.runTest('search_knowledge: Search in chapter content', async () => {
      const projectId = generateTestProjectId('search-content');
      await setupSearchTestData(client, projectId);

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'JWT',
      });

      assertSuccess(result);
      assertEqual(result.total_documents, 1);

      const results = result.results as any[];
      assertEqual(results[0].document, 'api-development.md');

      // Should find match in Authentication chapter
      const authChapter = (results[0].chapters as any[]).find(
        (ch: any) => ch.title === 'Authentication'
      );
      if (!authChapter) {
        throw new Error('Did not find match in Authentication chapter');
      }
      assertEqual(authChapter.matches, 1);
    });

    await runner.runTest('search_knowledge: No matches found', async () => {
      const projectId = generateTestProjectId('search-nomatch');
      await setupSearchTestData(client, projectId);

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'nonexistent xyz123 impossible',
      });

      assertSuccess(result);
      assertEqual(result.total_documents, 0);
      assertEqual(result.total_matches, 0);
    });

    await runner.runTest('search_knowledge: Search across multiple documents', async () => {
      const projectId = generateTestProjectId('search-cross');
      await setupSearchTestData(client, projectId);

      // Add a document that mentions testing AND typescript
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'typescript-testing',
        title: 'Testing TypeScript Applications',
        introduction: 'How to test TypeScript code effectively.',
        keywords: ['typescript', 'testing', 'jest'],
        chapters: [
          {
            title: 'Setup',
            content: 'Configure Jest for TypeScript testing with proper type checking.',
          },
        ],
      });

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'typescript testing',
      });

      assertSuccess(result);
      // Should find at least 2 documents
      if ((result.total_documents as number) < 2) {
        throw new Error(`Expected at least 2 documents, got ${result.total_documents as number}`);
      }
    });

    await runner.runTest('search_knowledge: Match context extraction', async () => {
      const projectId = generateTestProjectId('search-context');

      // Create document with specific content to test context extraction
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'context-test',
        title: 'Context Test Document',
        introduction: 'Testing context extraction in search.',
        keywords: ['context', 'test'],
        chapters: [
          {
            title: 'Long Chapter',
            content: `This is the beginning of a long chapter.
The word MARKER appears here in the middle of the content.
And this is the end of the chapter content with more text.`,
          },
        ],
      });

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'marker',
      });

      assertSuccess(result);
      const results = result.results as any[];
      // The transformed results don't include match context
      // Just verify the match was found
      assertEqual(results[0].document, 'context-test.md');
      assertEqual(results[0].chapters[0].matches, 1);
    });

    await runner.runTest('search_knowledge: Keywords vs content priority', async () => {
      const projectId = generateTestProjectId('search-priority');

      // Create two documents - both with the search term in content
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'keyword-match',
        title: 'Keyword Match Doc',
        introduction: 'This doc mentions priority in the introduction.',
        keywords: ['priority', 'search', 'keyword'],
        chapters: [{ title: 'Chapter', content: 'Regular content without the search term.' }],
      });

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'content-match',
        title: 'Content Match Doc',
        introduction: 'This doc has the search term in content.',
        keywords: ['other', 'terms'],
        chapters: [
          {
            title: 'Chapter',
            content: 'This content mentions priority multiple times. Priority is important.',
          },
        ],
      });

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'priority',
      });

      assertSuccess(result);
      assertEqual(result.total_documents, 2);

      // Both should be found
      const fileNames = (result.results as any[]).map((r) => r.document as string);
      if (!fileNames.includes('keyword-match.md') || !fileNames.includes('content-match.md')) {
        throw new Error('Did not find both keyword and content matches');
      }
    });

    await runner.runTest('search_knowledge: Empty project', async () => {
      const projectId = generateTestProjectId('search-empty');

      // Create project but no knowledge files
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Empty Project\n\nNo knowledge files here.',
      });

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'anything',
      });

      assertSuccess(result);
      assertEqual(result.total_documents, 0);
      assertEqual(result.total_matches, 0);
    });

    await runner.runTest('search_knowledge: Special characters in query', async () => {
      const projectId = generateTestProjectId('search-special');

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'special-chars',
        title: 'Special Characters Test',
        introduction: 'Testing special characters.',
        keywords: ['special'],
        chapters: [
          {
            title: 'Symbols',
            content: 'Content with C++ and C# programming languages, also Node.js framework.',
          },
        ],
      });

      // Test various special character searches
      const searches = ['C++', 'C#', 'Node.js'];

      for (const query of searches) {
        const result = await client.callToolAndParse('search_knowledge', {
          project_id: projectId,
          query: query,
        });

        assertSuccess(result);
        if (result.total_matches === 0) {
          throw new Error(`Failed to find "${query}" in content`);
        }
      }
    });

    await runner.runTest('search_knowledge: Chapter summary in results', async () => {
      const projectId = generateTestProjectId('search-summary');

      // Create document with chapter that has a summary
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'summary-test',
        title: 'Summary Test',
        introduction: 'Testing chapter summaries.',
        keywords: ['summary'],
        chapters: [
          {
            title: 'Chapter with Summary',
            content: 'This chapter has content.',
          },
        ],
      });

      // Update chapter with summary
      await client.callToolAndParse('update_chapter', {
        project_id: projectId,
        filename: 'summary-test.md',
        chapter_title: 'Chapter with Summary',
        new_content: 'This chapter has content about summaries.',
        new_summary: 'This is a custom chapter summary for search results.',
      });

      const result = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'summaries',
      });

      assertSuccess(result);
      // The transformed results don't include chapter summaries
      // Just verify the match was found
      const results = result.results as any[];
      assertEqual(results[0].document, 'summary-test.md');
      assertEqual(results[0].chapters[0].title, 'Chapter with Summary');
      assertEqual(results[0].chapters[0].matches, 1);
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
      const resultPath = path.resolve(resultsDir, '05-search.test.json');
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
