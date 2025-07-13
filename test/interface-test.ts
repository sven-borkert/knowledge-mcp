#!/usr/bin/env tsx
// @ts-nocheck

import { rmSync, existsSync } from 'fs';
import { join } from 'path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Type definitions for MCP responses
interface ToolResponse {
  success: boolean;
  error?: string;
  message?: string;
}

interface GetProjectMainResponse extends ToolResponse {
  exists: boolean;
  content: string;
}

interface CreateKnowledgeResponse extends ToolResponse {
  filepath?: string;
}

interface SearchKnowledgeResponse extends ToolResponse {
  results: Array<{
    document: string;
    chapters: Array<{
      title: string;
      matches: number;
    }>;
  }>;
}

interface ListFilesResponse {
  files: string[];
}

interface ListChaptersResponse {
  chapters: Array<{
    title: string;
    summary?: string;
  }>;
}

interface GetKnowledgeFileResponse extends ToolResponse {
  document?: {
    filename: string;
    metadata: {
      title: string;
      keywords: string[];
      created: string;
      updated: string;
    };
    introduction: string;
    chapters: Array<{
      title: string;
      content: string;
      summary?: string;
    }>;
    full_content: string;
  };
}

interface GetServerInfoResponse extends ToolResponse {
  name: string;
  version: string;
  storage_path: string;
  description: string;
}

interface GetStorageStatusResponse extends ToolResponse {
  storage_path: string;
  has_changes: boolean;
  current_branch: string;
  status_details: string;
}

interface SyncStorageResponse extends ToolResponse {
  message: string;
  files_committed: number;
  pushed: boolean;
  commit_message?: string;
}

// Generic test expectation type
interface TestExpectation<T = unknown> {
  expected: T;
  actual: T;
}

interface TestResult {
  test: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  error?: string;
}

class MCPInterfaceTest {
  private client: Client;
  private results: TestResult[] = [];
  private readonly TEST_PROJECT = 'test-project-1';
  private readonly testDirectory: string;

  constructor() {
    this.client = new Client({
      name: 'test-client',
      version: '1.0.0',
    });

    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
    this.testDirectory = join(homeDir, '.knowledge-mcp-test-ts');
  }

  async connect(): Promise<void> {
    // Clean up any existing test data before starting
    this.cleanup();

    const serverPath = join(process.cwd(), 'dist', 'knowledge-mcp', 'index.js');
    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
        KNOWLEDGE_MCP_HOME: this.testDirectory,
      },
    });

    await this.client.connect(transport);
    console.log('✅ Connected to MCP server');
  }

  // Helper method to parse tool responses
  private parseToolResponse<T extends ToolResponse>(result: any): T {
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid result');
    }

    // Handle the case where result is already parsed
    if ('success' in result || 'error' in result || 'exists' in result || 'results' in result) {
      return result as T;
    }

    // Handle MCP response format
    if (!result.content || !Array.isArray(result.content) || result.content.length === 0) {
      throw new Error('No response content');
    }
    const firstContent = result.content[0];
    if (!firstContent || firstContent.type !== 'text' || !firstContent.text) {
      throw new Error('Invalid response content');
    }

    try {
      return JSON.parse(firstContent.text as string) as T;
    } catch (e) {
      throw new Error(`Failed to parse response: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Helper method to parse resource responses
  private parseResourceResponse<T>(result: any): T {
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid result');
    }

    if (!result.contents || !Array.isArray(result.contents) || result.contents.length === 0) {
      throw new Error('No resource content');
    }
    const firstContent = result.contents[0];
    if (!firstContent || !('text' in firstContent) || typeof firstContent.text !== 'string') {
      throw new Error('Invalid resource content');
    }

    try {
      return JSON.parse(firstContent.text as string) as T;
    } catch (e) {
      throw new Error(`Failed to parse response: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async runTests(): Promise<void> {
    console.log('\n🧪 Running MCP Interface Tests\n');

    // Test 1.1: Create New Project
    await this.test('1.1: Create New Project', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'update_project_main',
        arguments: {
          project_id: this.TEST_PROJECT,
          content: '# Test Project 1\n\nThis is a test project for MCP validation.',
        },
      });

      const response = this.parseToolResponse<ToolResponse>(result as any);
      return {
        expected: { success: true },
        actual: { success: response.success },
      };
    });

    // Test 1.2: Retrieve Project Instructions
    await this.test('1.2: Retrieve Project Instructions', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'get_project_main',
        arguments: {
          project_id: this.TEST_PROJECT,
        },
      });

      const response = this.parseToolResponse<GetProjectMainResponse>(result as any);
      return {
        expected: { exists: true, hasContent: true },
        actual: {
          exists: response.exists,
          hasContent: response.content.includes('Test Project 1'),
        },
      };
    });

    // Test 1.3: Update Existing Project
    await this.test('1.3: Update Existing Project', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'update_project_main',
        arguments: {
          project_id: this.TEST_PROJECT,
          content: '# Test Project 1 - Updated\n\nThis project has been updated.',
        },
      });

      const response = this.parseToolResponse<ToolResponse>(result as any);
      return {
        expected: { success: true },
        actual: { success: response.success },
      };
    });

    // Test 1.4: Non-existent Project
    await this.test('1.4: Non-existent Project', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'get_project_main',
        arguments: {
          project_id: 'non-existent-project',
        },
      });

      const response = this.parseToolResponse<GetProjectMainResponse>(result as any);
      return {
        expected: { exists: false },
        actual: { exists: response.exists },
      };
    });

    // Test 2.1: Create Knowledge Document
    await this.test('2.1: Create Knowledge Document', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'create_knowledge_file',
        arguments: {
          project_id: this.TEST_PROJECT,
          filename: 'api-guide',
          title: 'API Documentation Guide',
          introduction: 'This guide covers our API endpoints.',
          keywords: ['api', 'documentation', 'rest'],
          chapters: [
            { title: 'Getting Started', content: 'To begin using our API...' },
            { title: 'Authentication', content: 'API keys are required...' },
          ],
        },
      });

      const response = this.parseToolResponse<CreateKnowledgeResponse>(result as any);
      return {
        expected: { success: true, hasFilepath: true },
        actual: {
          success: response.success,
          hasFilepath: !!response.filepath,
        },
      };
    });

    // Test 2.2: Create Document with Special Characters
    await this.test('2.2: Filename with Special Characters', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'create_knowledge_file',
        arguments: {
          project_id: this.TEST_PROJECT,
          filename: "User's Guide & FAQ",
          title: 'User Guide and FAQ',
          introduction: 'Common questions answered.',
          keywords: ['faq', 'help'],
          chapters: [{ title: 'FAQ', content: 'Q: How do I...' }],
        },
      });

      const response = this.parseToolResponse<CreateKnowledgeResponse>(result as any);
      return {
        expected: {
          success: true,
          slugifiedFilename: 'knowledge/users-guide-and-faq.md',
        },
        actual: {
          success: response.success,
          slugifiedFilename: response.filepath,
        },
      };
    });

    // Test 3.1: Single Keyword Search
    await this.test('3.1: Single Keyword Search', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'search_knowledge',
        arguments: {
          project_id: this.TEST_PROJECT,
          query: 'api',
        },
      });

      const response = this.parseToolResponse<SearchKnowledgeResponse>(result as any);
      return {
        expected: { success: true, hasResults: true },
        actual: {
          success: response.success,
          hasResults: response.results.length > 0,
        },
      };
    });

    // Test 3.3: Case Insensitive Search
    await this.test('3.3: Case Insensitive Search', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'search_knowledge',
        arguments: {
          project_id: this.TEST_PROJECT,
          query: 'API',
        },
      });

      const response = this.parseToolResponse<SearchKnowledgeResponse>(result as any);
      return {
        expected: { success: true, hasResults: true },
        actual: {
          success: response.success,
          hasResults: response.results.length > 0,
        },
      };
    });

    // Test 4.1: Update Existing Chapter
    await this.test('4.1: Update Existing Chapter', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'update_chapter',
        arguments: {
          project_id: this.TEST_PROJECT,
          filename: 'api-guide.md',
          chapter_title: 'Authentication',
          new_content: 'Updated: Use OAuth 2.0 for authentication...',
        },
      });

      const response = this.parseToolResponse<ToolResponse>(result as any);
      return {
        expected: { success: true },
        actual: { success: response.success },
      };
    });

    // Test 4.2: Non-existent Chapter
    await this.test('4.2: Non-existent Chapter', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'update_chapter',
        arguments: {
          project_id: this.TEST_PROJECT,
          filename: 'api-guide.md',
          chapter_title: 'Non-existent Chapter',
          new_content: 'This should fail',
        },
      });

      const response = this.parseToolResponse<ToolResponse>(result as any);
      return {
        expected: { success: false, hasError: true },
        actual: {
          success: response.success,
          hasError: !!response.error,
        },
      };
    });

    // Test 4.3: Get Full Knowledge Document
    await this.test('4.3: Get Full Knowledge Document', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'get_knowledge_file',
        arguments: {
          project_id: this.TEST_PROJECT,
          filename: 'api-guide.md',
        },
      });

      const response = this.parseToolResponse<GetKnowledgeFileResponse>(result as any);
      return {
        expected: {
          success: true,
          hasDocument: true,
          hasMetadata: true,
          hasChapters: true,
          hasFullContent: true,
        },
        actual: {
          success: response.success,
          hasDocument: !!response.document,
          hasMetadata: !!response.document?.metadata?.title,
          hasChapters: !!(response.document?.chapters && response.document.chapters.length > 0),
          hasFullContent: !!response.document?.full_content,
        },
      };
    });

    // Test 4.4: Get Non-existent Knowledge Document
    await this.test(
      '4.4: Get Non-existent Knowledge Document',
      async (): Promise<TestExpectation> => {
        const result = await this.client.callTool({
          name: 'get_knowledge_file',
          arguments: {
            project_id: this.TEST_PROJECT,
            filename: 'non-existent-file.md',
          },
        });

        const response = this.parseToolResponse<GetKnowledgeFileResponse>(result as any);
        return {
          expected: { success: false, hasError: true },
          actual: {
            success: response.success,
            hasError: !!response.error,
          },
        };
      }
    );

    // Test 5.1: Delete Existing File
    await this.test('5.1: Delete Existing File', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'delete_knowledge_file',
        arguments: {
          project_id: this.TEST_PROJECT,
          filename: 'users-guide-and-faq.md',
        },
      });

      const response = this.parseToolResponse<ToolResponse>(result as any);
      return {
        expected: { success: true },
        actual: { success: response.success },
      };
    });

    // Test 5.2: Delete Non-existent File
    await this.test('5.2: Delete Non-existent File', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'delete_knowledge_file',
        arguments: {
          project_id: this.TEST_PROJECT,
          filename: 'users-guide-and-faq.md',
        },
      });

      const response = this.parseToolResponse<ToolResponse>(result as any);
      return {
        expected: { success: false, hasError: true },
        actual: {
          success: response.success,
          hasError: !!response.error,
        },
      };
    });

    // Test 6.1: List Files Resource
    await this.test('6.1: List Files Resource', async (): Promise<TestExpectation> => {
      const result = await this.client.readResource({
        uri: `knowledge://projects/${this.TEST_PROJECT}/files`,
      });

      const response = this.parseResourceResponse<ListFilesResponse>(result as any);
      return {
        expected: { hasFiles: true },
        actual: { hasFiles: response.files.length > 0 },
      };
    });

    // Test 6.2: List Chapters Resource
    await this.test('6.2: List Chapters Resource', async (): Promise<TestExpectation> => {
      const result = await this.client.readResource({
        uri: `knowledge://projects/${this.TEST_PROJECT}/chapters/api-guide.md`,
      });

      const response = this.parseResourceResponse<ListChaptersResponse>(result as any);
      return {
        expected: { hasChapters: true },
        actual: { hasChapters: response.chapters.length > 0 },
      };
    });

    // Test 6.3: Main Resource
    await this.test('6.3: Main Resource', async (): Promise<TestExpectation> => {
      const result = await this.client.readResource({
        uri: `knowledge://projects/${this.TEST_PROJECT}/main`,
      });

      const contentItem = result.contents[0];
      const content = contentItem && 'text' in contentItem ? String(contentItem.text) : '';
      return {
        expected: { hasContent: true },
        actual: { hasContent: content.includes('Test Project 1') },
      };
    });

    // Test 7.1: Get Server Information
    await this.test('7.1: Get Server Information', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'get_server_info',
        arguments: {},
      });

      const response = this.parseToolResponse<GetServerInfoResponse>(result as any);
      return {
        expected: {
          hasName: true,
          hasVersion: true,
          hasStoragePath: true,
          hasDescription: true,
        },
        actual: {
          hasName: !!response.name,
          hasVersion: !!response.version,
          hasStoragePath: !!response.storage_path,
          hasDescription: !!response.description,
        },
      };
    });

    // Test 7.2: Get Storage Status
    await this.test('7.2: Get Storage Status', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'get_storage_status',
        arguments: {},
      });

      const response = this.parseToolResponse<GetStorageStatusResponse>(result as any);
      return {
        expected: {
          hasStoragePath: true,
          hasChangesFlag: true,
          hasBranchField: true,
          hasStatusDetails: true,
        },
        actual: {
          hasStoragePath: !!response.storage_path,
          hasChangesFlag: typeof response.has_changes === 'boolean',
          hasBranchField: 'current_branch' in response,
          hasStatusDetails: !!response.status_details,
        },
      };
    });

    // Test 7.3: Sync Storage
    await this.test('7.3: Sync Storage', async (): Promise<TestExpectation> => {
      const result = await this.client.callTool({
        name: 'sync_storage',
        arguments: {},
      });

      const response = this.parseToolResponse<SyncStorageResponse>(result as any);
      return {
        expected: {
          hasMessage: true,
          hasFilesCommitted: true,
          hasPushedFlag: true,
        },
        actual: {
          hasMessage: !!response.message,
          hasFilesCommitted: typeof response.files_committed === 'number',
          hasPushedFlag: typeof response.pushed === 'boolean',
        },
      };
    });
  }

  private async test(name: string, testFn: () => Promise<TestExpectation>): Promise<void> {
    try {
      const { expected, actual } = await testFn();
      const passed = JSON.stringify(expected) === JSON.stringify(actual);

      this.results.push({
        test: name,
        passed,
        expected,
        actual,
      });

      console.log(`${passed ? '✅' : '❌'} ${name}`);
      if (!passed) {
        console.log(`   Expected: ${JSON.stringify(expected)}`);
        console.log(`   Actual: ${JSON.stringify(actual)}`);
      }
    } catch (error) {
      this.results.push({
        test: name,
        passed: false,
        expected: 'No error',
        actual: 'Error occurred',
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ ${name}`);
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  printSummary(): boolean {
    const passed = this.results.filter((r) => r.passed).length;
    const total = this.results.length;

    console.log('\n📊 Test Summary');
    console.log('─'.repeat(40));
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (passed < total) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`\n- ${r.test}`);
          if (r.error) {
            console.log(`  Error: ${r.error}`);
          }
        });
    }

    return passed === total;
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    console.log('\n👋 Disconnected from MCP server');
  }

  cleanup(showMessage: boolean = false): void {
    try {
      if (existsSync(this.testDirectory)) {
        rmSync(this.testDirectory, { recursive: true, force: true });
        if (showMessage) {
          console.log('🧹 Cleaned up test directory');
        }
      }
    } catch (error) {
      console.warn(
        `⚠️  Failed to clean up test directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Run the tests
async function main(): Promise<void> {
  const tester = new MCPInterfaceTest();
  let allTestsPassed = false;

  try {
    await tester.connect();
    await tester.runTests();
    allTestsPassed = tester.printSummary();
  } catch (error) {
    console.error('Test runner error:', error);
  } finally {
    await tester.disconnect();
    tester.cleanup(true);
    process.exit(allTestsPassed ? 0 : 1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
