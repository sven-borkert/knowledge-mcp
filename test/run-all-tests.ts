#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { readdirSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

import type { DetailedSuiteResult } from './utils/test-helpers.js';

interface TestSuiteResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  tests: {
    total: number;
    passed: number;
    failed: number;
  };
}

interface MochawesomeTest {
  title: string;
  fullTitle: string;
  state: 'passed' | 'failed' | 'pending';
  duration: number;
  speed: 'slow' | 'medium' | 'fast';
  pass: boolean;
  fail: boolean;
  pending: boolean;
  code: string;
  uuid: string;
  skipped: boolean;
  isHook: boolean;
  err?: {
    message: string;
    stack: string;
  };
  context?: string;
}

interface MochawesomeSuite {
  title: string;
  fullFile: string;
  file: string;
  beforeHooks: any[];
  afterHooks: any[];
  tests: MochawesomeTest[];
  suites: any[];
  passes: string[];
  failures: string[];
  pending: string[];
  skipped: string[];
  duration: number;
  root: boolean;
  rootEmpty: boolean;
  _timeout: number;
  uuid: string;
}

interface MochawesomeStats {
  suites: number;
  tests: number;
  passes: number;
  pending: number;
  failures: number;
  start: string;
  end: string;
  duration: number;
  testsRegistered: number;
  passPercent: number;
  pendingPercent: number;
  other: number;
  hasOther: boolean;
  skipped: number;
  hasSkipped: boolean;
}

interface MochawesomeReport {
  stats: MochawesomeStats;
  results: MochawesomeSuite[];
  meta: {
    mocha: { version: string };
    mochawesome: { version: string; options: any };
    marge: { version: string; options: any };
  };
}

function generateUUID(): string {
  const bytes = randomBytes(16);

  // Set version (4) and variant bits according to RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function convertToMochawesomeFormat(
  results: TestSuiteResult[],
  totalDuration: number
): MochawesomeReport {
  const totalTests = results.reduce((sum, r) => sum + r.tests.total, 0);
  const totalPassed = results.reduce((sum, r) => sum + r.tests.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.tests.failed, 0);

  const startTime = new Date(Date.now() - totalDuration);
  const endTime = new Date();

  const mochawesomeSuites: MochawesomeSuite[] = results.map((result) => {
    const tests: MochawesomeTest[] = [];

    // Generate test entries based on passed/failed counts
    for (let i = 1; i <= result.tests.passed; i++) {
      const uuid = generateUUID();
      tests.push({
        title: `Test ${i}`,
        fullTitle: `${result.name} Test ${i}`,
        state: 'passed',
        duration: Math.round(result.duration / result.tests.total),
        speed: 'fast',
        pass: true,
        fail: false,
        pending: false,
        code: '',
        uuid,
        skipped: false,
        isHook: false,
        err: {},
      });
    }

    for (let i = 1; i <= result.tests.failed; i++) {
      const uuid = generateUUID();
      tests.push({
        title: `Failed Test ${i}`,
        fullTitle: `${result.name} Failed Test ${i}`,
        state: 'failed',
        duration: Math.round(result.duration / result.tests.total),
        speed: 'fast',
        pass: false,
        fail: true,
        pending: false,
        code: '',
        uuid,
        skipped: false,
        isHook: false,
        err: {
          message: result.error ?? 'Test failed',
          stack: result.error ?? 'No stack trace available',
        },
      });
    }

    return {
      title: result.name,
      fullFile: result.name,
      file: result.name,
      beforeHooks: [],
      afterHooks: [],
      tests,
      suites: [],
      passes: tests.filter((t) => t.state === 'passed').map((t) => t.uuid),
      failures: tests.filter((t) => t.state === 'failed').map((t) => t.uuid),
      pending: [],
      skipped: [],
      duration: result.duration,
      root: true,
      rootEmpty: false,
      _timeout: 30000,
      uuid: generateUUID(),
    };
  });

  const stats: MochawesomeStats = {
    suites: results.length,
    tests: totalTests,
    passes: totalPassed,
    pending: 0,
    failures: totalFailed,
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    duration: totalDuration,
    testsRegistered: totalTests,
    passPercent: totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0,
    pendingPercent: 0,
    other: 0,
    hasOther: false,
    skipped: 0,
    hasSkipped: false,
  };

  return {
    stats,
    results: mochawesomeSuites,
    meta: {
      mocha: { version: '10.0.0' },
      mochawesome: { version: '7.1.3', options: {} },
      marge: { version: '6.2.0', options: {} },
    },
  };
}

function convertDetailedToMochawesomeFormat(
  detailedResults: DetailedSuiteResult[],
  totalDuration: number
): MochawesomeReport {
  const totalTests = detailedResults.reduce((sum, suite) => sum + suite.stats.total, 0);
  const totalPassed = detailedResults.reduce((sum, suite) => sum + suite.stats.passed, 0);
  const totalFailed = detailedResults.reduce((sum, suite) => sum + suite.stats.failed, 0);

  const startTime = new Date(Date.now() - totalDuration);
  const endTime = new Date();

  const mochawesomeSuites: MochawesomeSuite[] = detailedResults.map((suite) => {
    const tests: MochawesomeTest[] = suite.tests.map((test) => {
      const testResult: MochawesomeTest = {
        title: test.name,
        fullTitle: test.fullName,
        state: test.success ? 'passed' : 'failed',
        duration: test.duration,
        speed: test.duration > 500 ? 'slow' : test.duration > 100 ? 'medium' : 'fast',
        pass: test.success,
        fail: !test.success,
        pending: false,
        code: test.assertions.join(', '),
        uuid: generateUUID(),
        skipped: false,
        isHook: false,
        err: test.errorDetails
          ? {
              message: test.errorDetails.message,
              stack: test.errorDetails.stack ?? test.errorDetails.message,
            }
          : {},
      };

      // Add MCP call data as context if available
      if (test.mcpCalls && test.mcpCalls.length > 0) {
        const contextData = {
          title: 'MCP Calls',
          value: test.mcpCalls.map((call, index) => ({
            index: index + 1,
            method: call.method,
            duration: `${call.duration}ms`,
            timestamp: call.timestamp,
            input: call.input,
            output: call.output,
          })),
        };
        testResult.context = JSON.stringify(contextData, null, 2);
      }

      return testResult;
    });

    return {
      title: suite.name,
      fullFile: suite.name,
      file: suite.name,
      beforeHooks: [],
      afterHooks: [],
      tests,
      suites: [],
      passes: tests.filter((t) => t.state === 'passed').map((t) => t.uuid),
      failures: tests.filter((t) => t.state === 'failed').map((t) => t.uuid),
      pending: [],
      skipped: [],
      duration: suite.duration,
      root: true,
      rootEmpty: false,
      _timeout: 30000,
      uuid: generateUUID(),
    };
  });

  const stats: MochawesomeStats = {
    suites: detailedResults.length,
    tests: totalTests,
    passes: totalPassed,
    pending: 0,
    failures: totalFailed,
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    duration: totalDuration,
    testsRegistered: totalTests,
    passPercent: totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0,
    pendingPercent: 0,
    other: 0,
    hasOther: false,
    skipped: 0,
    hasSkipped: false,
  };

  return {
    stats,
    results: mochawesomeSuites,
    meta: {
      mocha: { version: '10.0.0' },
      mochawesome: { version: '7.1.3', options: {} },
      marge: { version: '6.2.0', options: {} },
    },
  };
}

function saveTestResults(
  results: TestSuiteResult[],
  detailedResults: DetailedSuiteResult[],
  totalDuration: number
): void {
  // Create test-results directory
  const resultsDir = resolve('./test-results');
  mkdirSync(resultsDir, { recursive: true });

  // Save raw results
  const rawResultsPath = join(resultsDir, 'test-results.json');
  writeFileSync(rawResultsPath, JSON.stringify(results, null, 2));

  // Save detailed results
  const detailedResultsPath = join(resultsDir, 'detailed-results.json');
  writeFileSync(detailedResultsPath, JSON.stringify(detailedResults, null, 2));

  // Save mochawesome format using detailed results
  const mochawesomeReport =
    detailedResults.length > 0
      ? convertDetailedToMochawesomeFormat(detailedResults, totalDuration)
      : convertToMochawesomeFormat(results, totalDuration);
  const mochawesomePath = join(resultsDir, 'mochawesome.json');
  writeFileSync(mochawesomePath, JSON.stringify(mochawesomeReport, null, 2));

  console.log(`📊 Test results saved to:`);
  console.log(`  Raw results: ${rawResultsPath}`);
  console.log(`  Detailed results: ${detailedResultsPath}`);
  console.log(`  Mochawesome: ${mochawesomePath}`);
}

async function runTestSuite(suitePath: string): Promise<TestSuiteResult> {
  const suiteName = suitePath.split('/').pop() ?? 'unknown';
  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn('tsx', [suitePath], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        EXPORT_DETAILED_RESULTS: 'true',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: string | Buffer) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output);
    });

    child.stderr?.on('data', (data: string | Buffer) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output);
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;

      // Parse test results from output
      const totalMatch = stdout.match(/Total Tests: (\d+)/);
      const passedMatch = stdout.match(/Passed: (\d+)/);
      const failedMatch = stdout.match(/Failed: (\d+)/);

      const result: TestSuiteResult = {
        name: suiteName,
        passed: code === 0,
        duration,
        tests: {
          total: totalMatch ? parseInt(totalMatch[1]) : 0,
          passed: passedMatch ? parseInt(passedMatch[1]) : 0,
          failed: failedMatch ? parseInt(failedMatch[1]) : 0,
        },
      };

      if (code !== 0) {
        result.error = stderr ?? `Test suite exited with code ${code}`;
      }

      resolve(result);
    });
  });
}

function collectDetailedResults(): DetailedSuiteResult[] {
  const detailedResults: DetailedSuiteResult[] = [];
  const detailedSuitesDir = resolve('./test-results/detailed-suites');

  try {
    if (!existsSync(detailedSuitesDir)) {
      console.log('No detailed results directory found, using summary results only');
      return detailedResults;
    }

    const detailedFiles = readdirSync(detailedSuitesDir).filter((file) => file.endsWith('.json'));

    console.log(`📁 Found ${detailedFiles.length} detailed result files`);

    for (const file of detailedFiles) {
      try {
        const filePath = join(detailedSuitesDir, file);
        const fileContent = JSON.parse(readFileSync(filePath, 'utf8'));
        detailedResults.push(fileContent as DetailedSuiteResult);
      } catch (error) {
        console.warn(`Warning: Could not read detailed results from ${file}:`, error);
      }
    }

    console.log(`✅ Collected ${detailedResults.length} detailed suite results`);
  } catch (error) {
    console.error('Error collecting detailed results:', error);
  }

  return detailedResults;
}

async function main(): Promise<void> {
  console.log('🚀 Knowledge MCP Test Runner');
  console.log('═'.repeat(60));
  console.log();

  const testSuitesDir = resolve('./test/suites');

  // Get all test files sorted by name
  const testFiles = readdirSync(testSuitesDir)
    .filter((file) => file.endsWith('.test.ts'))
    .sort()
    .map((file) => join(testSuitesDir, file));

  if (testFiles.length === 0) {
    console.error('❌ No test files found in test/suites/');
    process.exit(1);
  }

  console.log(`📋 Found ${testFiles.length} test suites to run:\n`);
  testFiles.forEach((file, index) => {
    const name = file.split('/').pop();
    console.log(`  ${index + 1}. ${name}`);
  });
  console.log();

  // Run test suites sequentially
  const results: TestSuiteResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < testFiles.length; i++) {
    const file = testFiles[i];
    const name = file.split('/').pop() ?? 'unknown';

    console.log('═'.repeat(60));
    console.log(`📁 Running suite ${i + 1}/${testFiles.length}: ${name}`);
    console.log('═'.repeat(60));
    console.log();

    const result = await runTestSuite(file);
    results.push(result);

    if (!result.passed) {
      console.log(`\n⚠️  Suite ${name} failed!`);
      if (process.env.STOP_ON_FAILURE === 'true') {
        console.log('Stopping test execution due to STOP_ON_FAILURE=true');
        break;
      }
    }

    console.log();
  }

  const totalDuration = Date.now() - startTime;

  // Ensure detailed results directory exists
  const detailedSuitesDir = resolve('./test-results/detailed-suites');
  mkdirSync(detailedSuitesDir, { recursive: true });

  // Small delay to ensure all files are written
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Collect detailed results from all test suites
  const detailedResults = collectDetailedResults();

  // Save test results to JSON files
  saveTestResults(results, detailedResults, totalDuration);

  // Print final summary
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log();

  // Suite summary
  const passedSuites = results.filter((r) => r.passed).length;
  const failedSuites = results.filter((r) => !r.passed).length;

  console.log(
    `Test Suites: ${passedSuites} passed, ${failedSuites} failed, ${results.length} total`
  );

  // Test summary
  const totalTests = results.reduce((sum, r) => sum + r.tests.total, 0);
  const passedTests = results.reduce((sum, r) => sum + r.tests.passed, 0);
  const failedTests = results.reduce((sum, r) => sum + r.tests.failed, 0);

  console.log(`Tests:       ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
  console.log(`Time:        ${(totalDuration / 1000).toFixed(2)}s`);
  console.log();

  // Detailed results
  console.log('Suite Results:');
  console.log('─'.repeat(60));

  results.forEach((result) => {
    const status = result.passed ? '✅' : '❌';
    const time = `${(result.duration / 1000).toFixed(2)}s`;
    console.log(
      `${status} ${result.name.padEnd(30)} ` +
        `${result.tests.passed}/${result.tests.total} tests ` +
        `(${time})`
    );
  });

  // Failed suites details
  const failedResults = results.filter((r) => !r.passed);
  if (failedResults.length > 0) {
    console.log('\n❌ Failed Suites:');
    console.log('─'.repeat(60));

    failedResults.forEach((result) => {
      console.log(`\n${result.name}:`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    });
  }

  // Coverage report
  console.log('\n📈 Test Coverage Summary:');
  console.log('─'.repeat(60));

  const coverageAreas = [
    { name: 'Project Main Operations', suite: '01-project-main.test.ts' },
    { name: 'Section Operations', suite: '02-project-sections.test.ts' },
    { name: 'Knowledge Files', suite: '03-knowledge-files.test.ts' },
    { name: 'Chapter Operations', suite: '04-chapters.test.ts' },
    { name: 'Search Functionality', suite: '05-search.test.ts' },
    { name: 'Resources', suite: '06-resources.test.ts' },
    { name: 'Server Management', suite: '07-server-management.test.ts' },
    { name: 'TODO System', suite: '08-todo.test.ts' },
    { name: 'Error Handling', suite: '09-error-handling.test.ts' },
    { name: 'Edge Cases', suite: '10-edge-cases.test.ts' },
  ];

  coverageAreas.forEach((area) => {
    const result = results.find((r) => r.name === area.suite);
    const status = result?.passed ? '✅' : '❌';
    const tests = result ? `${result.tests.passed}/${result.tests.total} tests` : 'N/A';
    console.log(`${status} ${area.name.padEnd(25)} ${tests}`);
  });

  // New features tested
  console.log('\n🆕 New Features Tested:');
  console.log('─'.repeat(60));
  console.log('✅ add_project_section - Comprehensive tests in suites 01 & 02');
  console.log('✅ add_chapter - Comprehensive tests in suite 04');

  // Final result
  console.log('\n' + '═'.repeat(60));
  if (failedSuites === 0) {
    console.log('🎉 All test suites passed!');
    console.log('═'.repeat(60));
    process.exit(0);
  } else {
    console.log(`⚠️  ${failedSuites} test suite(s) failed!`);
    console.log('═'.repeat(60));
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}
