#!/usr/bin/env node

import { StreamableHTTPTransport } from '@hatago/mcp-transport-internal'
import { serve } from '@hono/node-server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'

/**
 * Simple external MCP server providing math functionality
 * This server demonstrates tools that might conflict with other servers
 */

const app = new Hono()
const server = new McpServer(
  {
    name: 'external-mcp-math',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Basic calculator tool
server.registerTool(
  'math.calculate',
  {
    title: 'Math Calculator',
    description: 'Perform basic mathematical calculations',
    inputSchema: {},
  },
  async (args, _extra) => {
    const { expression = '1+1' } = args as {
      expression?: string
    }

    try {
      // Simple expression evaluator (only basic operations for security)
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '')

      if (!sanitized || sanitized !== expression) {
        throw new Error(
          'Invalid characters in expression. Only numbers and +, -, *, /, (), . are allowed.'
        )
      }

      // Use Function constructor for safe evaluation
      const result = new Function(`"use strict"; return (${sanitized})`)()

      if (typeof result !== 'number' || !Number.isFinite(result)) {
        throw new Error('Expression did not evaluate to a valid number')
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                expression: expression,
                result: result,
                type: 'calculation',
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                expression: expression,
                error: 'Calculation failed',
                message: error instanceof Error ? error.message : String(error),
                type: 'error',
              },
              null,
              2
            ),
          },
        ],
      }
    }
  }
)

// Random number generator tool
server.registerTool(
  'math.random',
  {
    title: 'Random Number Generator',
    description: 'Generate random numbers within specified range',
    inputSchema: {},
  },
  async (args, _extra) => {
    const {
      min = 1,
      max = 100,
      count = 1,
    } = args as {
      min?: number
      max?: number
      count?: number
    }

    try {
      const numbers: number[] = []
      const actualCount = Math.min(Math.max(1, Math.floor(count)), 1000) // Limit to 1000
      const actualMin = Math.min(min, max)
      const actualMax = Math.max(min, max)

      for (let i = 0; i < actualCount; i++) {
        const randomNum = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin
        numbers.push(randomNum)
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                numbers: numbers,
                min: actualMin,
                max: actualMax,
                count: actualCount,
                sum: numbers.reduce((a, b) => a + b, 0),
                average: numbers.reduce((a, b) => a + b, 0) / numbers.length,
                type: 'random_generation',
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                error: 'Random generation failed',
                message: error instanceof Error ? error.message : String(error),
                type: 'error',
              },
              null,
              2
            ),
          },
        ],
      }
    }
  }
)

// Conflicting tool name (same as clock server but different function)
server.registerTool(
  'getTimezone',
  {
    title: 'Math Timezone Offset',
    description: 'Calculate timezone offset in minutes (for math demonstrations)',
    inputSchema: {},
  },
  async (_args, _extra) => {
    const offset = new Date().getTimezoneOffset()

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              timezoneOffsetMinutes: offset,
              timezoneOffsetHours: offset / 60,
              isNegative: offset < 0,
              description: 'Timezone offset in minutes (negative means ahead of UTC)',
              type: 'timezone_math',
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    }
  }
)

// MCP endpoint using StreamableHTTPTransport
app.all('/mcp', async c => {
  const transport = new StreamableHTTPTransport()
  await server.connect(transport)
  return transport.handleRequest(c)
})

// Health check endpoint
app.get('/health', c => {
  return c.json({
    status: 'ok',
    server: 'external-mcp-math',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})

// Root endpoint with server info
app.get('/', c => {
  return c.json({
    name: 'External MCP Math Server',
    version: '1.0.0',
    description: 'Simple MCP server providing math functionality with intentional conflicts',
    mcp_endpoint: '/mcp',
    health_endpoint: '/health',
    tools: [
      {
        name: 'math.calculate',
        description: 'Perform basic mathematical calculations',
      },
      {
        name: 'math.random',
        description: 'Generate random numbers within specified range',
      },
      {
        name: 'getTimezone',
        description: 'Calculate timezone offset in minutes (conflicts with clock server)',
      },
    ],
  })
})

// Start server on different port
const port = Number(process.env.PORT) || 8789
const hostname = process.env.HOSTNAME || 'localhost'

console.log('🧮 External MCP Math Server starting...')
console.log(`   Server: http://${hostname}:${port}`)
console.log(`   Health: http://${hostname}:${port}/health`)
console.log(`   MCP:    http://${hostname}:${port}/mcp`)

serve({
  fetch: app.fetch,
  port,
  hostname,
})

console.log(`✅ Math server running on http://${hostname}:${port}`)
console.log('📋 Available tools: math.calculate, math.random, getTimezone (conflicts with clock)')
