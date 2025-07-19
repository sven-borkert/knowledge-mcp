#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import {
  TestRunner,
  assertSuccess,
  assertEqual,
  assertArrayLength,
  assertContains,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-resources'));
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
    runner.setSuite('Resource Operations', 'Resource Management');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    // Note: Since our test client doesn't directly support MCP resources,
    // we'll test resource-like functionality through the tools

    await runner.runTest('Resource concept: Project main as resource', async () => {
      const projectId = generateTestProjectId('resource-main');
      const content = '# Project Resource Test\n\nTesting resource concepts.';

      // Create project
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      // The resource URI would be: knowledge://projects/{project_id}/main
      // We test this by verifying the content can be retrieved
      const result = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });

      assertSuccess(result);
      assertEqual(result.content, content);
    });

    await runner.runTest('Resource concept: List knowledge files', async () => {
      const projectId = generateTestProjectId('resource-files');

      // Create multiple knowledge files
      const files = [
        { filename: 'guide-1', title: 'Guide 1' },
        { filename: 'guide-2', title: 'Guide 2' },
        { filename: 'guide-3', title: 'Guide 3' },
      ];

      for (const file of files) {
        await client.callToolAndParse('create_knowledge_file', {
          project_id: projectId,
          filename: file.filename,
          title: file.title,
          introduction: `Introduction to ${file.title}`,
          keywords: ['test', 'resource'],
          chapters: [{ title: 'Chapter 1', content: 'Content 1' }],
        });
      }

      // The resource URI would be: knowledge://projects/{project_id}/files
      // We verify by checking all files can be retrieved
      for (const file of files) {
        const result = await client.callToolAndParse('get_knowledge_file', {
          project_id: projectId,
          filename: `${file.filename}.md`,
        });

        assertSuccess(result);
        assertEqual((result.document as any).metadata.title, file.title);
      }
    });

    await runner.runTest('Resource concept: List chapters in file', async () => {
      const projectId = generateTestProjectId('resource-chapters');

      // Create a knowledge file with multiple chapters
      const chapters = [
        { title: 'Introduction', content: 'Intro content' },
        { title: 'Getting Started', content: 'Getting started content' },
        { title: 'Advanced Topics', content: 'Advanced content' },
        { title: 'Reference', content: 'Reference content' },
      ];

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'multi-chapter',
        title: 'Multi-Chapter Document',
        introduction: 'Document with multiple chapters',
        keywords: ['chapters', 'test'],
        chapters: chapters,
      });

      // The resource URI would be: knowledge://projects/{project_id}/chapters/multi-chapter.md
      // We verify by checking the document structure
      const result = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'multi-chapter.md',
      });

      assertSuccess(result);
      const doc = result.document as any;
      assertArrayLength(doc.chapters as unknown[], 4);

      // Verify chapter order and titles
      for (let i = 0; i < chapters.length; i++) {
        assertEqual(doc.chapters[i].title, chapters[i].title);
      }
    });

    await runner.runTest('Resource behavior: Empty project resources', async () => {
      const projectId = generateTestProjectId('resource-empty');

      // Create project with no knowledge files
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Empty Project',
      });

      // Resource listing would return empty for files
      // We simulate this by trying to get a non-existent file
      const result = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'non-existent.md',
      });

      // Should fail as no files exist
      assertEqual(result.success, false);
    });

    await runner.runTest('Resource metadata: File creation timestamps', async () => {
      const projectId = generateTestProjectId('resource-metadata');

      // Create a knowledge file
      const beforeCreate = new Date();

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'metadata-test',
        title: 'Metadata Test',
        introduction: 'Testing resource metadata',
        keywords: ['metadata'],
        chapters: [{ title: 'Test Chapter', content: 'Test content' }],
      });

      const afterCreate = new Date();

      // Get the file and check metadata
      const result = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'metadata-test.md',
      });

      assertSuccess(result);
      const metadata = (result.document as any).metadata;

      // Check creation timestamp is reasonable
      const created = new Date(metadata.created as string);
      if (created < beforeCreate || created > afterCreate) {
        throw new Error('Creation timestamp outside expected range');
      }

      // Initially, created and updated should be the same
      assertEqual(metadata.created, metadata.updated);
    });

    await runner.runTest('Resource metadata: Update timestamps', async () => {
      const projectId = generateTestProjectId('resource-update');

      // Create a knowledge file
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'update-test',
        title: 'Update Test',
        introduction: 'Testing update timestamps',
        keywords: ['update'],
        chapters: [{ title: 'Original', content: 'Original content' }],
      });

      // Get original metadata
      const originalResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'update-test.md',
      });

      const originalMetadata = (originalResult.document as any).metadata;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update a chapter
      await client.callToolAndParse('update_chapter', {
        project_id: projectId,
        filename: 'update-test.md',
        chapter_title: 'Original',
        new_content: 'Updated content',
      });

      // Get updated metadata
      const updatedResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'update-test.md',
      });

      const updatedMetadata = (updatedResult.document as any).metadata;

      // Created should remain the same
      assertEqual(updatedMetadata.created, originalMetadata.created);

      // Updated should be different
      if (updatedMetadata.updated === originalMetadata.updated) {
        throw new Error('Updated timestamp did not change after modification');
      }
    });

    await runner.runTest('Resource structure: Nested project organization', async () => {
      // Test multiple projects to simulate resource organization
      const projects = [
        { id: generateTestProjectId('org-frontend'), name: 'Frontend Project' },
        { id: generateTestProjectId('org-backend'), name: 'Backend Project' },
        { id: generateTestProjectId('org-shared'), name: 'Shared Libraries' },
      ];

      // Create projects with different structures
      for (const project of projects) {
        // Create main.md
        await client.callToolAndParse('update_project_main', {
          project_id: project.id,
          content: `# ${project.name}\n\nMain documentation for ${project.name}`,
        });

        // Create knowledge files
        await client.callToolAndParse('create_knowledge_file', {
          project_id: project.id,
          filename: 'overview',
          title: `${project.name} Overview`,
          introduction: `Overview of ${project.name}`,
          keywords: ['overview', project.id],
          chapters: [{ title: 'Introduction', content: 'Project introduction' }],
        });
      }

      // Verify each project's resources are isolated
      for (const project of projects) {
        const mainResult = await client.callToolAndParse('get_project_main', {
          project_id: project.id,
        });

        assertSuccess(mainResult);
        assertContains(mainResult.content as string, project.name);

        const fileResult = await client.callToolAndParse('get_knowledge_file', {
          project_id: project.id,
          filename: 'overview.md',
        });

        assertSuccess(fileResult);
        assertEqual((fileResult.document as any).metadata.title, `${project.name} Overview`);
      }
    });

    await runner.runTest('Resource integrity: Consistent state after operations', async () => {
      const projectId = generateTestProjectId('resource-integrity');

      // Create initial state
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Integrity Test\n\n## Section 1\nContent 1\n\n## Section 2\nContent 2',
      });

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'integrity-doc',
        title: 'Integrity Document',
        introduction: 'Testing resource integrity',
        keywords: ['integrity'],
        chapters: [
          { title: 'Chapter A', content: 'Content A' },
          { title: 'Chapter B', content: 'Content B' },
        ],
      });

      // Perform multiple operations
      await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Section 1',
        new_content: 'Modified content 1',
      });

      await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'integrity-doc.md',
        chapter_title: 'Chapter C',
        content: 'Content C',
        position: 'end',
      });

      // Verify final state is consistent
      const mainResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });

      assertContains(mainResult.content as string, 'Modified content 1');
      assertContains(mainResult.content as string, '## Section 2');

      const fileResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'integrity-doc.md',
      });

      const chapters = (fileResult.document as any).chapters;
      assertArrayLength(chapters as unknown[], 3);
      assertEqual(chapters[2].title, 'Chapter C');
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
      const resultPath = path.resolve(resultsDir, '06-resources.test.json');
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
