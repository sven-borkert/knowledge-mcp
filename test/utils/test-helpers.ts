import { existsSync, rmSync, mkdirSync } from 'fs';

// Test result tracking
export interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  duration: number;
}

// MCP call tracking interface
export interface MCPCallData {
  method: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  duration: number;
  timestamp: string;
}

// Detailed test result tracking for HTML reports
export interface DetailedTestResult {
  name: string;
  fullName: string;
  suite: string;
  success: boolean;
  error?: string;
  errorDetails?: {
    message: string;
    stack?: string;
    assertion?: string;
  };
  duration: number;
  assertions: string[];
  category: string;
  mcpCalls?: MCPCallData[];
}

// Detailed test suite result
export interface DetailedSuiteResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  duration: number;
  tests: DetailedTestResult[];
  stats: {
    total: number;
    passed: number;
    failed: number;
  };
}

// Helper function for safe error message formatting
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Global tracker for current test runner (to track assertions)
let currentRunner: TestRunner | null = null;

export function setCurrentRunner(runner: TestRunner): void {
  currentRunner = runner;
}

// Assertion helpers
export function assertSuccess(data: Record<string, unknown>, message?: string): void {
  currentRunner?.trackAssertion('assertSuccess');
  if (!data.success) {
    throw new Error(message ?? `Expected success=true, got: ${JSON.stringify(data)}`);
  }
}

export function assertFailure(data: Record<string, unknown>, message?: string): void {
  currentRunner?.trackAssertion('assertFailure');
  if (data.success !== false) {
    throw new Error(message ?? `Expected success=false, got: ${JSON.stringify(data)}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  currentRunner?.trackAssertion('assertEqual');
  if (actual !== expected) {
    throw new Error(
      message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

export function assertContains(text: string, substring: string, message?: string): void {
  currentRunner?.trackAssertion('assertContains');
  if (!text.includes(substring)) {
    throw new Error(message ?? `Expected text to contain "${substring}", but it didn't`);
  }
}

export function assertNotContains(text: string, substring: string, message?: string): void {
  currentRunner?.trackAssertion('assertNotContains');
  if (text.includes(substring)) {
    throw new Error(message ?? `Expected text not to contain "${substring}", but it did`);
  }
}

export function assertArrayLength<T>(array: T[], expectedLength: number, message?: string): void {
  currentRunner?.trackAssertion('assertArrayLength');
  if (array.length !== expectedLength) {
    throw new Error(message ?? `Expected array length ${expectedLength}, got ${array.length}`);
  }
}

// Test environment helpers
export function setupTestEnvironment(storagePath: string): void {
  // Clean up any existing test data
  if (existsSync(storagePath)) {
    rmSync(storagePath, { recursive: true, force: true });
  }

  // Create fresh test environment
  mkdirSync(storagePath, { recursive: true });
}

export function cleanupTestEnvironment(storagePath: string): void {
  // Clean up test data
  if (existsSync(storagePath)) {
    rmSync(storagePath, { recursive: true, force: true });
  }
}

// Test runner helpers
export class TestRunner {
  private results: TestResult[] = [];
  private detailedResults: DetailedTestResult[] = [];
  private currentSuite: string = '';
  private currentCategory: string = '';
  private detailedTracking: boolean = false;
  private currentAssertions: string[] = [];
  private currentMCPCalls: MCPCallData[] = [];

  setSuite(name: string, category: string = 'General'): void {
    this.currentSuite = name;
    this.currentCategory = category;
    console.log(`\n🧪 ${name}`);
    console.log('═'.repeat(50));
  }

  enableDetailedTracking(): void {
    this.detailedTracking = true;
  }

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    const fullName = this.currentSuite ? `${this.currentSuite}: ${name}` : name;
    console.log(`🔄 Running: ${name}`);

    // Reset tracking for this test
    this.currentAssertions = [];
    this.currentMCPCalls = [];

    try {
      await testFn();
      const duration = Date.now() - startTime;

      // Basic result tracking (existing)
      this.results.push({ name: fullName, success: true, duration });

      // Detailed result tracking (new)
      if (this.detailedTracking) {
        this.detailedResults.push({
          name,
          fullName,
          suite: this.currentSuite,
          success: true,
          duration,
          assertions: [...this.currentAssertions],
          category: this.currentCategory,
          mcpCalls: [...this.currentMCPCalls],
        });
      }

      console.log(`✅ Passed: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = formatError(error);

      // Basic result tracking (existing)
      this.results.push({ name: fullName, success: false, error: errorMsg, duration });

      // Detailed result tracking (new)
      if (this.detailedTracking) {
        const errorDetails = this.extractErrorDetails(error);
        this.detailedResults.push({
          name,
          fullName,
          suite: this.currentSuite,
          success: false,
          error: errorMsg,
          errorDetails,
          duration,
          assertions: [...this.currentAssertions],
          category: this.currentCategory,
          mcpCalls: [...this.currentMCPCalls],
        });
      }

      console.log(`❌ Failed: ${name} (${duration}ms)`);
      console.log(`   Error: ${errorMsg}`);
    }
  }

  getResults(): TestResult[] {
    return [...this.results];
  }

  getDetailedResults(): DetailedTestResult[] {
    return [...this.detailedResults];
  }

  getDetailedSuiteResult(): DetailedSuiteResult {
    const tests = this.getDetailedResults();
    const total = tests.length;
    const passed = tests.filter((t) => t.success).length;
    const failed = total - passed;
    const totalTime = tests.reduce((sum, t) => sum + t.duration, 0);

    return {
      name: this.currentSuite,
      category: this.currentCategory,
      passed: failed === 0,
      duration: totalTime,
      tests,
      stats: {
        total,
        passed,
        failed,
      },
    };
  }

  private extractErrorDetails(error: unknown): {
    message: string;
    stack?: string;
    assertion?: string;
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        assertion: this.extractAssertionType(error.message),
      };
    }
    return {
      message: String(error),
      assertion: 'unknown',
    };
  }

  private extractAssertionType(message: string): string {
    if (message.includes('Expected success=true')) return 'assertSuccess';
    if (message.includes('Expected success=false')) return 'assertFailure';
    if (message.includes('Expected') && message.includes('got')) return 'assertEqual';
    if (message.includes('Expected text to contain')) return 'assertContains';
    if (message.includes('Expected text not to contain')) return 'assertNotContains';
    if (message.includes('Expected array length')) return 'assertArrayLength';
    return 'custom';
  }

  trackAssertion(type: string): void {
    if (this.detailedTracking) {
      this.currentAssertions.push(type);
    }
  }

  trackMCPCall(callData: MCPCallData): void {
    if (this.detailedTracking) {
      this.currentMCPCalls.push(callData);
    }
  }

  printSummary(): void {
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
          if (r.error) {
            console.log(`  Error: ${r.error}`);
          }
        });
    }
  }

  exitWithResults(): void {
    const failed = this.results.filter((r) => !r.success).length;
    if (failed === 0) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed.`);
      process.exit(1);
    }
  }
}

// Utility to generate test data
export function generateTestProjectId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function generateTestContent(sections: number = 3): string {
  const content = ['# Test Project\n'];

  for (let i = 1; i <= sections; i++) {
    content.push(`## Section ${i}\n`);
    content.push(`Content for section ${i}.\n`);
    content.push(`This is some test content with multiple lines.\n`);
    content.push(`Line 3 of section ${i}.\n\n`);
  }

  return content.join('');
}
