#!/usr/bin/env tsx

/**
 * Deployment Verification Script for Hatago ChatGPT Connector
 *
 * This script verifies that the deployed Hatago server is working correctly
 * with ChatGPT connector functionality.
 */

import { logger } from '../src/utils/logger.js'

interface VerificationResult {
  endpoint: string
  status: 'pass' | 'fail' | 'skip'
  message: string
  responseTime?: number
}

class DeploymentVerifier {
  private baseUrl: string
  private results: VerificationResult[] = []

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  }

  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ response: Response; responseTime: number }> {
    const start = Date.now()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    // Add Accept header for MCP and SSE endpoints
    if (endpoint.includes('/mcp') || endpoint.includes('/sse/')) {
      headers.Accept = 'application/json, text/event-stream'
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers,
      ...options,
    })
    const responseTime = Date.now() - start
    return { response, responseTime }
  }

  private addResult(result: VerificationResult): void {
    this.results.push(result)
    const status = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️'
    const timing = result.responseTime ? ` (${result.responseTime}ms)` : ''
    logger.info(`${status} ${result.endpoint}: ${result.message}${timing}`)
  }

  private parseSSEResponse(text: string): any {
    try {
      // SSE format: "event: message\ndata: {json}\n\n"
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6)
          return JSON.parse(data)
        }
      }
      throw new Error('No data line found in SSE response')
    } catch (error) {
      throw new Error(
        `Failed to parse SSE response: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  async verifyHealthEndpoint(): Promise<void> {
    try {
      const { response, responseTime } = await this.makeRequest('/health')

      if (response.ok) {
        this.addResult({
          endpoint: '/health',
          status: 'pass',
          message: 'Health check passed',
          responseTime,
        })
      } else {
        this.addResult({
          endpoint: '/health',
          status: 'fail',
          message: `Health check failed with status ${response.status}`,
          responseTime,
        })
      }
    } catch (error) {
      this.addResult({
        endpoint: '/health',
        status: 'fail',
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async verifyMCPInitialize(): Promise<void> {
    try {
      const { response, responseTime } = await this.makeRequest('/mcp', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: {
              name: 'deployment-verifier',
              version: '1.0.0',
            },
          },
        }),
      })

      if (response.ok) {
        const text = await response.text()
        const data = this.parseSSEResponse(text)
        if (data.result?.protocolVersion) {
          this.addResult({
            endpoint: '/mcp (initialize)',
            status: 'pass',
            message: `MCP initialization successful, protocol version: ${data.result.protocolVersion}`,
            responseTime,
          })
        } else {
          this.addResult({
            endpoint: '/mcp (initialize)',
            status: 'fail',
            message: 'MCP initialization returned invalid response',
            responseTime,
          })
        }
      } else {
        this.addResult({
          endpoint: '/mcp (initialize)',
          status: 'fail',
          message: `MCP initialization failed with status ${response.status}`,
          responseTime,
        })
      }
    } catch (error) {
      this.addResult({
        endpoint: '/mcp (initialize)',
        status: 'fail',
        message: `MCP initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async verifyMCPToolsList(): Promise<void> {
    try {
      const { response, responseTime } = await this.makeRequest('/mcp', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }),
      })

      if (response.ok) {
        const text = await response.text()
        const data = this.parseSSEResponse(text)
        if (data.result && Array.isArray(data.result.tools)) {
          const tools = data.result.tools.map((tool: any) => tool.name)
          const hasSearch = tools.includes('search')
          const hasFetch = tools.includes('fetch')

          if (hasSearch && hasFetch) {
            this.addResult({
              endpoint: '/mcp (tools/list)',
              status: 'pass',
              message: `Tools list successful, found search and fetch tools. All tools: [${tools.join(', ')}]`,
              responseTime,
            })
          } else {
            this.addResult({
              endpoint: '/mcp (tools/list)',
              status: 'fail',
              message: `Missing required tools. Found: [${tools.join(', ')}], missing: ${!hasSearch ? 'search ' : ''}${!hasFetch ? 'fetch' : ''}`,
              responseTime,
            })
          }
        } else {
          this.addResult({
            endpoint: '/mcp (tools/list)',
            status: 'fail',
            message: 'Tools list returned invalid response',
            responseTime,
          })
        }
      } else {
        this.addResult({
          endpoint: '/mcp (tools/list)',
          status: 'fail',
          message: `Tools list failed with status ${response.status}`,
          responseTime,
        })
      }
    } catch (error) {
      this.addResult({
        endpoint: '/mcp (tools/list)',
        status: 'fail',
        message: `Tools list failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async verifySearchTool(): Promise<void> {
    try {
      const { response, responseTime } = await this.makeRequest('/mcp', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query: 'MCP protocol',
            },
          },
        }),
      })

      if (response.ok) {
        const text = await response.text()
        const data = this.parseSSEResponse(text)
        if (data.result?.content && Array.isArray(data.result.content)) {
          const content = data.result.content[0]
          if (content?.text) {
            const searchResponse = JSON.parse(content.text)
            if (searchResponse.results && Array.isArray(searchResponse.results)) {
              this.addResult({
                endpoint: '/mcp (search tool)',
                status: 'pass',
                message: `Search tool successful, found ${searchResponse.results.length} results`,
                responseTime,
              })
            } else {
              this.addResult({
                endpoint: '/mcp (search tool)',
                status: 'fail',
                message: 'Search tool returned invalid results format',
                responseTime,
              })
            }
          } else {
            this.addResult({
              endpoint: '/mcp (search tool)',
              status: 'fail',
              message: 'Search tool returned no content',
              responseTime,
            })
          }
        } else {
          this.addResult({
            endpoint: '/mcp (search tool)',
            status: 'fail',
            message: 'Search tool returned invalid response',
            responseTime,
          })
        }
      } else {
        this.addResult({
          endpoint: '/mcp (search tool)',
          status: 'fail',
          message: `Search tool failed with status ${response.status}`,
          responseTime,
        })
      }
    } catch (error) {
      this.addResult({
        endpoint: '/mcp (search tool)',
        status: 'fail',
        message: `Search tool failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async verifyFetchTool(): Promise<void> {
    try {
      const { response, responseTime } = await this.makeRequest('/mcp', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'fetch',
            arguments: {
              id: 'doc-1',
            },
          },
        }),
      })

      if (response.ok) {
        const text = await response.text()
        const data = this.parseSSEResponse(text)
        if (data.result?.content && Array.isArray(data.result.content)) {
          const content = data.result.content[0]
          if (content?.text) {
            const document = JSON.parse(content.text)
            if (document.id && document.title && document.text) {
              this.addResult({
                endpoint: '/mcp (fetch tool)',
                status: 'pass',
                message: `Fetch tool successful, retrieved document: ${document.title}`,
                responseTime,
              })
            } else {
              this.addResult({
                endpoint: '/mcp (fetch tool)',
                status: 'fail',
                message: 'Fetch tool returned invalid document format',
                responseTime,
              })
            }
          } else {
            this.addResult({
              endpoint: '/mcp (fetch tool)',
              status: 'fail',
              message: 'Fetch tool returned no content',
              responseTime,
            })
          }
        } else {
          this.addResult({
            endpoint: '/mcp (fetch tool)',
            status: 'fail',
            message: 'Fetch tool returned invalid response',
            responseTime,
          })
        }
      } else {
        this.addResult({
          endpoint: '/mcp (fetch tool)',
          status: 'fail',
          message: `Fetch tool failed with status ${response.status}`,
          responseTime,
        })
      }
    } catch (error) {
      this.addResult({
        endpoint: '/mcp (fetch tool)',
        status: 'fail',
        message: `Fetch tool failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async verifySSEEndpoint(): Promise<void> {
    try {
      const { response, responseTime } = await this.makeRequest('/sse/', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: {
              name: 'deployment-verifier',
              version: '1.0.0',
            },
          },
        }),
      })

      if (response.ok) {
        this.addResult({
          endpoint: '/sse/ (ChatGPT compatible)',
          status: 'pass',
          message: 'SSE endpoint is accessible',
          responseTime,
        })
      } else {
        this.addResult({
          endpoint: '/sse/ (ChatGPT compatible)',
          status: 'fail',
          message: `SSE endpoint failed with status ${response.status}`,
          responseTime,
        })
      }
    } catch (error) {
      this.addResult({
        endpoint: '/sse/ (ChatGPT compatible)',
        status: 'fail',
        message: `SSE endpoint failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async runAllTests(): Promise<boolean> {
    logger.info(`🚀 Starting deployment verification for: ${this.baseUrl}`)
    logger.info('─'.repeat(80))

    await this.verifyHealthEndpoint()
    await this.verifyMCPInitialize()
    await this.verifyMCPToolsList()
    await this.verifySearchTool()
    await this.verifyFetchTool()
    await this.verifySSEEndpoint()

    logger.info('─'.repeat(80))

    const passCount = this.results.filter(r => r.status === 'pass').length
    const failCount = this.results.filter(r => r.status === 'fail').length
    const skipCount = this.results.filter(r => r.status === 'skip').length

    logger.info(`📊 Results: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`)

    if (failCount === 0) {
      logger.info('🎉 All tests passed! Deployment is ready for ChatGPT integration.')
      return true
    }
    logger.error('💥 Some tests failed. Please check the deployment before using with ChatGPT.')
    return false
  }
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2]

  if (!baseUrl) {
    logger.error('Usage: tsx scripts/verify-deployment.ts <base-url>')
    logger.error('Example: tsx scripts/verify-deployment.ts https://hatago-dev.example.workers.dev')
    process.exit(1)
  }

  try {
    const verifier = new DeploymentVerifier(baseUrl)
    const success = await verifier.runAllTests()
    process.exit(success ? 0 : 1)
  } catch (error) {
    logger.error('Verification failed:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('Unhandled error:', error)
    process.exit(1)
  })
}
