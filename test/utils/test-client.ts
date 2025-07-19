import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

import type { TestRunner, MCPCallData } from './test-helpers.js';

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

interface TestClientOptions {
  serverPath: string;
  storagePath?: string;
  logLevel?: string;
  timeout?: number;
}

export class MCPTestClient {
  private server: ChildProcess | null = null;
  private requestId = 1;
  private responses: Map<number, MCPResponse> = new Map();
  private isConnected = false;
  private options: Required<TestClientOptions>;
  private testRunner: TestRunner | null = null;

  constructor(options: TestClientOptions) {
    this.options = {
      serverPath: options.serverPath,
      storagePath: options.storagePath ?? process.env.KNOWLEDGE_MCP_HOME ?? '',
      logLevel: options.logLevel ?? 'ERROR',
      timeout: options.timeout ?? 5000,
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env: Record<string, string> = {
        ...process.env,
        KNOWLEDGE_MCP_LOG_LEVEL: this.options.logLevel,
      };

      if (this.options.storagePath) {
        env.KNOWLEDGE_MCP_HOME = this.options.storagePath;
      }

      this.server = spawn('node', [this.options.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
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
        // Ignore server logs in tests unless debugging
        if (this.options.logLevel === 'DEBUG') {
          console.error(_data.toString());
        }
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

  setTestRunner(runner: TestRunner): void {
    this.testRunner = runner;
  }

  async callTool(toolName: string, arguments_: Record<string, unknown>): Promise<MCPResponse> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    const startTime = Date.now();
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
      }, this.options.timeout);

      const checkResponse = (): void => {
        if (this.responses.has(id)) {
          clearTimeout(timeout);
          const response = this.responses.get(id);
          this.responses.delete(id);

          const duration = Date.now() - startTime;

          // Track the MCP call if we have a test runner
          if (this.testRunner && response) {
            const callData: MCPCallData = {
              method: toolName,
              input: arguments_,
              output: response.error
                ? { error: response.error }
                : response.result?.content?.[0]?.text
                  ? JSON.parse(response.result.content[0].text)
                  : {},
              duration,
              timestamp: new Date().toISOString(),
            };
            this.testRunner.trackMCPCall(callData);
          }

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

  // Helper method to extract result content
  private extractResult(response: MCPResponse): Record<string, unknown> {
    if (!response.result?.content?.[0]?.text) {
      throw new Error('Invalid response format');
    }
    return JSON.parse(response.result.content[0].text) as Record<string, unknown>;
  }
}
