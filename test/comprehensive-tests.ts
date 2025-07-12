#!/usr/bin/env tsx

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

// Type definitions for MCP protocol
interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-comprehensive-test'));
const SERVER_PATH = resolve('./dist/knowledge-mcp/index.js');
const TEST_DATA_PATH = resolve('./test/data');

// Helper function for safe error message formatting
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Test utilities
class MCPTestClient {
  private server: ChildProcess | null = null;
  private requestId = 1;
  private responses: Map<number, MCPResponse> = new Map();
  private isConnected = false;

  // Helper method to extract result content
  private extractResult(response: MCPResponse): Record<string, unknown> {
    if (!response.result?.content?.[0]?.text) {
      throw new Error('Invalid response format');
    }
    return JSON.parse(response.result.content[0].text) as Record<string, unknown>;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          KNOWLEDGE_MCP_HOME: TEST_STORAGE_PATH,
          KNOWLEDGE_MCP_LOG_LEVEL: 'ERROR', // Reduce noise
        },
      });

      this.server.stdout?.on('data', (data: Buffer) => {
        const lines = data
          .toString()
          .split('\n')
          .filter((line: string) => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line) as { id?: number };
            if (response.id) {
              this.responses.set(response.id, response as MCPResponse);
            }
          } catch {
            // Ignore non-JSON lines (logs, etc.)
          }
        }
      });

      this.server.stderr?.on('data', (_data: Buffer) => {
        // Ignore server logs in comprehensive tests
      });

      this.server.on('error', (error) => {
        reject(new Error(`Server failed to start: ${error.message}`));
      });

      // Wait for server to initialize
      setTimeout(() => {
        this.isConnected = true;
        resolve();
      }, 1000);
    });
  }

  async disconnect(): Promise<void> {
    if (this.server) {
      this.server.kill();
      this.server = null;
      this.isConnected = false;
    }
    // Add actual async operation if needed
    await Promise.resolve();
  }

  async callTool(toolName: string, arguments_: Record<string, unknown>): Promise<MCPResponse> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    const id = this.requestId++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments_,
      },
    };

    this.server?.stdin?.write(JSON.stringify(request) + '\n');

    // Wait for response
    return new Promise<MCPResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to ${toolName}`));
      }, 5000);

      const checkResponse = (): void => {
        if (this.responses.has(id)) {
          clearTimeout(timeout);
          const response = this.responses.get(id);
          this.responses.delete(id);

          if (response?.error) {
            reject(new Error(`Tool error: ${JSON.stringify(response.error)}`));
          } else if (response?.result?.content?.[0]?.text) {
            resolve(response);
          } else {
            reject(new Error('Invalid response format'));
          }
        } else {
          setTimeout(checkResponse, 100);
        }
      };

      checkResponse();
    });
  }

  // Convenience method for tool calls that returns parsed result
  async callToolAndParse(
    toolName: string,
    arguments_: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const response = await this.callTool(toolName, arguments_);
    return this.extractResult(response);
  }
}

// Test result tracking
interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  duration: number;
}

class TestRunner {
  private results: TestResult[] = [];
  private client: MCPTestClient;

  constructor() {
    this.client = new MCPTestClient();
  }

  async setup(): Promise<void> {
    // Clean up any existing test data
    if (existsSync(TEST_STORAGE_PATH)) {
      rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }

    // Create fresh test environment
    mkdirSync(TEST_STORAGE_PATH, { recursive: true });

    // Connect to server
    await this.client.connect();

    console.log('🧪 Comprehensive MCP Tests Started');
    console.log(`📁 Test storage: ${TEST_STORAGE_PATH}`);
    console.log(`📄 Test data: ${TEST_DATA_PATH}\n`);
  }

  async teardown(): Promise<void> {
    await this.client.disconnect();

    // Clean up test data
    if (existsSync(TEST_STORAGE_PATH)) {
      rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }
  }

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`🔄 Running: ${name}`);

    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, success: true, duration });
      console.log(`✅ Passed: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = formatError(error);
      this.results.push({ name, success: false, error: errorMsg, duration });
      console.log(`❌ Failed: ${name} (${duration}ms)`);
      console.log(`   Error: ${errorMsg}`);
    }
  }

  async runAllTests(): Promise<void> {
    await this.setup();

    try {
      // Test get_project_main
      await this.testGetProjectMain();

      // Test update_project_main
      await this.testUpdateProjectMain();

      // Test project section operations
      await this.testProjectSectionOperations();

      // Test knowledge file operations
      await this.testKnowledgeFileOperations();

      // Test search functionality
      await this.testSearchKnowledge();

      // Test chapter operations
      await this.testChapterOperations();

      // Test deletion operations
      await this.testDeletionOperations();
    } finally {
      await this.teardown();
      this.printSummary();
    }
  }

  private async testGetProjectMain(): Promise<void> {
    await this.runTest('get_project_main: Non-existing project', async () => {
      const data = await this.client.callToolAndParse('get_project_main', {
        project_id: 'non-existing-project',
      });

      if (data.exists !== false || data.content !== '') {
        throw new Error(`Expected exists=false, got: ${JSON.stringify(data)}`);
      }
    });

    await this.runTest('get_project_main: Create and retrieve project', async () => {
      const sampleContent = readFileSync(join(TEST_DATA_PATH, 'sample-project-main.md'), 'utf8');

      // Create project
      await this.client.callToolAndParse('update_project_main', {
        project_id: 'test-project-1',
        content: sampleContent,
      });

      // Retrieve project
      const data = await this.client.callToolAndParse('get_project_main', {
        project_id: 'test-project-1',
      });
      if (data.exists !== true || data.content !== sampleContent) {
        throw new Error(`Expected exists=true with correct content`);
      }
    });

    await this.runTest('get_project_main: Project with special characters', async () => {
      const specialProjectId = 'test-project-special-chars-äöü';
      const content = '# Special Project\n\nWith üñíçødé characters!';

      await this.client.callTool('update_project_main', {
        project_id: specialProjectId,
        content,
      });

      const result = await this.client.callTool('get_project_main', {
        project_id: specialProjectId,
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.exists || data.content !== content) {
        throw new Error('Failed to handle special characters');
      }
    });
  }

  private async testUpdateProjectMain(): Promise<void> {
    await this.runTest('update_project_main: Create new project', async () => {
      const content = '# New Test Project\n\n## Section 1\n\nContent here';
      const result = await this.client.callTool('update_project_main', {
        project_id: 'new-test-project',
        content,
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to create project: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }
    });

    await this.runTest('update_project_main: Replace existing project', async () => {
      const originalContent = '# Original Content';
      const newContent = '# Replaced Content\n\n## New Section\n\nCompletely different';

      // Create original
      await this.client.callTool('update_project_main', {
        project_id: 'replace-test-project',
        content: originalContent,
      });

      // Replace
      const result = await this.client.callTool('update_project_main', {
        project_id: 'replace-test-project',
        content: newContent,
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to replace project: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }

      // Verify replacement
      const getResult = await this.client.callTool('get_project_main', {
        project_id: 'replace-test-project',
      });

      if (!getResult.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const getData = JSON.parse(getResult.result.content[0].text) as { content: string };
      if (getData.content !== newContent) {
        throw new Error('Content was not properly replaced');
      }
    });

    await this.runTest('update_project_main: Large project content', async () => {
      // Create large content (simulate large CLAUDE.md)
      const sections: string[] = [];
      for (let i = 1; i <= 50; i++) {
        sections.push(`## Section ${i}\n\nThis is section ${i} with some content.\n`);
      }
      const largeContent = '# Large Project\n\n' + sections.join('\n');

      const result = await this.client.callTool('update_project_main', {
        project_id: 'large-test-project',
        content: largeContent,
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to handle large content: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }
    });
  }

  private async testProjectSectionOperations(): Promise<void> {
    // Setup project for section tests
    const setupContent = `# Section Test Project

## Section A
Content of section A

## Section B  
Content of section B

## Section C
Content of section C`;

    await this.client.callTool('update_project_main', {
      project_id: 'section-test-project',
      content: setupContent,
    });

    await this.runTest('update_project_section: Update existing section', async () => {
      const result = await this.client.callTool('update_project_section', {
        project_id: 'section-test-project',
        section_header: '## Section B',
        new_content: 'Updated content for section B',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to update section: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }

      // Verify update
      const getResult = await this.client.callTool('get_project_main', {
        project_id: 'section-test-project',
      });

      if (!getResult.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const mainData = JSON.parse(getResult.result.content[0].text) as { content: string };
      if (!mainData.content.includes('Updated content for section B')) {
        throw new Error('Section was not updated');
      }
    });

    await this.runTest('update_project_section: Invalid section header', async () => {
      const result = await this.client.callTool('update_project_section', {
        project_id: 'section-test-project',
        section_header: '## Non-existent Section',
        new_content: 'This should fail',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (data.success) {
        throw new Error('Should have failed for non-existent section');
      }
    });

    await this.runTest('remove_project_section: Remove existing section', async () => {
      const result = await this.client.callTool('remove_project_section', {
        project_id: 'section-test-project',
        section_header: '## Section C',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to remove section: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }

      // Verify removal
      const getResult = await this.client.callTool('get_project_main', {
        project_id: 'section-test-project',
      });

      if (!getResult.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const mainData = JSON.parse(getResult.result.content[0].text) as { content: string };
      if (mainData.content.includes('## Section C')) {
        throw new Error('Section was not removed');
      }
    });

    await this.runTest('remove_project_section: Remove non-existent section', async () => {
      const result = await this.client.callTool('remove_project_section', {
        project_id: 'section-test-project',
        section_header: '## Already Removed Section',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (data.success) {
        throw new Error('Should have failed for non-existent section');
      }
    });
  }

  private async testKnowledgeFileOperations(): Promise<void> {
    await this.runTest('create_knowledge_file: Create new knowledge document', async () => {
      const result = await this.client.callTool('create_knowledge_file', {
        project_id: 'knowledge-test-project',
        filename: 'test-knowledge-doc',
        title: 'Test Knowledge Document',
        introduction: 'This is a test knowledge document.',
        keywords: ['test', 'knowledge', 'documentation'],
        chapters: [
          { title: 'Chapter 1', content: 'Content of chapter 1' },
          { title: 'Chapter 2', content: 'Content of chapter 2' },
        ],
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to create knowledge file: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }
    });

    await this.runTest('create_knowledge_file: Duplicate filename', async () => {
      // Try to create the same file again
      const result = await this.client.callTool('create_knowledge_file', {
        project_id: 'knowledge-test-project',
        filename: 'test-knowledge-doc',
        title: 'Duplicate Test',
        introduction: 'This should fail.',
        keywords: ['duplicate'],
        chapters: [{ title: 'Test', content: 'Test' }],
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (data.success) {
        throw new Error('Should have failed for duplicate filename');
      }
    });

    await this.runTest('create_knowledge_file: Special characters in filename', async () => {
      const result = await this.client.callTool('create_knowledge_file', {
        project_id: 'knowledge-test-project',
        filename: 'Special File Name with Spaces & Symbols!',
        title: 'Special Characters Test',
        introduction: 'Testing filename sanitization.',
        keywords: ['special', 'characters'],
        chapters: [{ title: 'Test Chapter', content: 'Test content' }],
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to handle special characters: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }
    });

    await this.runTest('get_knowledge_file: Retrieve existing document', async () => {
      const result = await this.client.callTool('get_knowledge_file', {
        project_id: 'knowledge-test-project',
        filename: 'test-knowledge-doc.md',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as {
        success: boolean;
        document?: { chapters: unknown[] };
        error?: unknown;
      };
      if (!data.success || !data.document) {
        throw new Error(
          `Failed to retrieve knowledge file: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }

      if (data.document.chapters.length !== 2) {
        throw new Error('Incorrect number of chapters retrieved');
      }
    });

    await this.runTest('get_knowledge_file: Non-existent document', async () => {
      const result = await this.client.callTool('get_knowledge_file', {
        project_id: 'knowledge-test-project',
        filename: 'non-existent.md',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (data.success) {
        throw new Error('Should have failed for non-existent file');
      }
    });
  }

  private async testSearchKnowledge(): Promise<void> {
    // Create some documents for searching
    await this.client.callTool('create_knowledge_file', {
      project_id: 'search-test-project',
      filename: 'search-doc-1',
      title: 'TypeScript Documentation',
      introduction: 'This document covers TypeScript programming.',
      keywords: ['typescript', 'programming', 'javascript'],
      chapters: [
        {
          title: 'Basic Types',
          content: 'TypeScript provides several basic types including string, number, and boolean.',
        },
        { title: 'Interfaces', content: 'Interfaces define the shape of objects in TypeScript.' },
      ],
    });

    await this.client.callTool('create_knowledge_file', {
      project_id: 'search-test-project',
      filename: 'search-doc-2',
      title: 'Testing Guide',
      introduction: 'This guide covers testing strategies.',
      keywords: ['testing', 'jest', 'unit-tests'],
      chapters: [
        {
          title: 'Unit Testing',
          content: 'Unit tests verify individual components work correctly.',
        },
        {
          title: 'Integration Testing',
          content: 'Integration tests verify components work together.',
        },
      ],
    });

    await this.runTest('search_knowledge: Single keyword match', async () => {
      const result = await this.client.callTool('search_knowledge', {
        project_id: 'search-test-project',
        query: 'typescript',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success || data.total_documents === 0) {
        throw new Error('Failed to find TypeScript document');
      }
    });

    await this.runTest('search_knowledge: Multiple keyword search', async () => {
      const result = await this.client.callTool('search_knowledge', {
        project_id: 'search-test-project',
        query: 'testing unit',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success || data.total_matches === 0) {
        throw new Error('Failed to find testing-related content');
      }
    });

    await this.runTest('search_knowledge: No matches found', async () => {
      const result = await this.client.callTool('search_knowledge', {
        project_id: 'search-test-project',
        query: 'nonexistent-term-xyz-123',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success || data.total_matches !== 0) {
        throw new Error('Should return no matches for non-existent term');
      }
    });
  }

  private async testChapterOperations(): Promise<void> {
    // Create a document for chapter operations
    await this.client.callTool('create_knowledge_file', {
      project_id: 'chapter-test-project',
      filename: 'chapter-test-doc',
      title: 'Chapter Operations Test',
      introduction: 'Testing chapter operations.',
      keywords: ['chapter', 'operations'],
      chapters: [
        { title: 'Original Chapter 1', content: 'Original content 1' },
        { title: 'Original Chapter 2', content: 'Original content 2' },
        { title: 'Original Chapter 3', content: 'Original content 3' },
      ],
    });

    await this.runTest('update_chapter: Update existing chapter', async () => {
      const result = await this.client.callTool('update_chapter', {
        project_id: 'chapter-test-project',
        filename: 'chapter-test-doc.md',
        chapter_title: 'Original Chapter 2',
        new_content: 'Updated content for chapter 2',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to update chapter: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }
    });

    await this.runTest('update_chapter: Non-existent chapter', async () => {
      const result = await this.client.callTool('update_chapter', {
        project_id: 'chapter-test-project',
        filename: 'chapter-test-doc.md',
        chapter_title: 'Non-existent Chapter',
        new_content: 'This should fail',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (data.success) {
        throw new Error('Should have failed for non-existent chapter');
      }
    });

    await this.runTest('remove_chapter: Remove existing chapter', async () => {
      const result = await this.client.callTool('remove_chapter', {
        project_id: 'chapter-test-project',
        filename: 'chapter-test-doc.md',
        chapter_title: 'Original Chapter 3',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to remove chapter: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }

      // Verify removal
      const getResult = await this.client.callTool('get_knowledge_file', {
        project_id: 'chapter-test-project',
        filename: 'chapter-test-doc.md',
      });

      if (!getResult.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const docData = JSON.parse(getResult.result.content[0].text) as {
        document: { chapters: unknown[] };
      };
      if (docData.document.chapters.length !== 2) {
        throw new Error('Chapter was not removed');
      }
    });

    await this.runTest('remove_chapter: Non-existent chapter', async () => {
      const result = await this.client.callTool('remove_chapter', {
        project_id: 'chapter-test-project',
        filename: 'chapter-test-doc.md',
        chapter_title: 'Already Removed Chapter',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (data.success) {
        throw new Error('Should have failed for non-existent chapter');
      }
    });
  }

  private async testDeletionOperations(): Promise<void> {
    // Create a document for deletion
    await this.client.callTool('create_knowledge_file', {
      project_id: 'deletion-test-project',
      filename: 'to-be-deleted',
      title: 'Document to Delete',
      introduction: 'This document will be deleted.',
      keywords: ['deletion', 'test'],
      chapters: [{ title: 'Test Chapter', content: 'Test content' }],
    });

    await this.runTest('delete_knowledge_file: Delete existing file', async () => {
      const result = await this.client.callTool('delete_knowledge_file', {
        project_id: 'deletion-test-project',
        filename: 'to-be-deleted.md',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (!data.success) {
        throw new Error(
          `Failed to delete file: ${data.error ? formatError(data.error) : 'Unknown error'}`
        );
      }

      // Verify deletion
      const getResult = await this.client.callTool('get_knowledge_file', {
        project_id: 'deletion-test-project',
        filename: 'to-be-deleted.md',
      });

      if (!getResult.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const getData = JSON.parse(getResult.result.content[0].text) as { success: boolean };
      if (getData.success) {
        throw new Error('File was not properly deleted');
      }
    });

    await this.runTest('delete_knowledge_file: Delete non-existent file', async () => {
      const result = await this.client.callTool('delete_knowledge_file', {
        project_id: 'deletion-test-project',
        filename: 'already-deleted.md',
      });

      if (!result.result?.content?.[0]?.text) {
        throw new Error('Invalid response format');
      }
      const data = JSON.parse(result.result.content[0].text) as Record<string, unknown>;
      if (data.success) {
        throw new Error('Should have failed for non-existent file');
      }
    });
  }

  private printSummary(): void {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.success).length;
    const failed = total - passed;
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log('\n📊 Test Summary');
    console.log('════════════════════════════════════════');
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log(`Total Time: ${totalTime}ms`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`- ${r.name}`);
          console.log(`  Error: ${r.error}`);
        });
    }

    console.log('\n🎯 Coverage Summary:');
    console.log('- get_project_main: ✅ Tested (3 cases)');
    console.log('- update_project_main: ✅ Tested (3 cases)');
    console.log('- update_project_section: ✅ Tested (2 cases)');
    console.log('- remove_project_section: ✅ Tested (2 cases)');
    console.log('- create_knowledge_file: ✅ Tested (3 cases)');
    console.log('- get_knowledge_file: ✅ Tested (2 cases)');
    console.log('- search_knowledge: ✅ Tested (3 cases)');
    console.log('- update_chapter: ✅ Tested (2 cases)');
    console.log('- remove_chapter: ✅ Tested (2 cases)');
    console.log('- delete_knowledge_file: ✅ Tested (2 cases)');

    if (failed === 0) {
      console.log('\n🎉 All tests passed! MCP server is working correctly.');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Please review and fix issues.`);
      process.exit(1);
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const runner = new TestRunner();
  await runner.runAllTests();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}
