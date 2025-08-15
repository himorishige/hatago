#!/usr/bin/env node

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'

/**
 * Simple external MCP server providing clock functionality
 * This server demonstrates basic MCP tools that can be connected to Hatago
 */

const app = new Hono()
const server = new McpServer(
  {
    name: 'external-mcp-clock',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Get current time tool
server.registerTool(
  'clock.getTime',
  {
    title: 'Get Current Time',
    description: 'Returns the current date and time in various formats',
    inputSchema: {}
  },
  async (args, extra) => {
    const { timezone = 'UTC', format = 'iso' } = args as {
      timezone?: string
      format?: 'iso' | 'locale' | 'unix'
    }

    try {
      const now = new Date()
      let formattedTime: string
      
      switch (format) {
        case 'unix':
          formattedTime = Math.floor(now.getTime() / 1000).toString()
          break
        case 'locale':
          formattedTime = now.toLocaleString('en-US', { 
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
          })
          break
        case 'iso':
        default:
          if (timezone === 'UTC') {
            formattedTime = now.toISOString()
          } else {
            // For non-UTC timezones, we'll show the ISO format with timezone info
            formattedTime = now.toLocaleString('sv-SE', { timeZone: timezone }) + 
                           ` (${timezone})`
          }
          break
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              currentTime: formattedTime,
              timezone,
              format,
              timestamp: now.getTime(),
              serverTime: now.toISOString()
            }, null, 2)
          }
        ]
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Failed to get current time',
              message: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }
        ]
      }
    }
  }
)

// Get timezone information tool
server.registerTool(
  'clock.getTimezone',
  {
    title: 'Get Timezone Information',
    description: 'Returns information about available timezones or details about a specific timezone',
    inputSchema: {}
  },
  async (args, extra) => {
    const { timezone, list = false } = args as {
      timezone?: string
      list?: boolean
    }

    try {
      if (list) {
        // Return list of common timezones
        const commonTimezones = [
          'UTC',
          'America/New_York',
          'America/Los_Angeles',
          'America/Chicago',
          'America/Denver',
          'Europe/London',
          'Europe/Paris',
          'Europe/Berlin',
          'Asia/Tokyo',
          'Asia/Shanghai',
          'Asia/Kolkata',
          'Australia/Sydney',
          'Pacific/Auckland'
        ]

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                commonTimezones,
                total: commonTimezones.length,
                note: 'These are common timezone identifiers. Use with clock.getTime tool.'
              }, null, 2)
            }
          ]
        }
      }

      if (timezone) {
        // Get info about specific timezone
        const now = new Date()
        try {
          const timeInZone = now.toLocaleString('en-US', { 
            timeZone: timezone,
            timeZoneName: 'long'
          })
          
          const offsetTest = new Date().toLocaleString('sv-SE', { timeZone: timezone })
          
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  timezone,
                  currentTime: timeInZone,
                  isValid: true,
                  utcTime: now.toISOString(),
                  localTime: offsetTest
                }, null, 2)
              }
            ]
          }
        } catch (tzError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  timezone,
                  isValid: false,
                  error: 'Invalid timezone identifier',
                  suggestion: 'Use clock.getTimezone with list=true to see valid options'
                }, null, 2)
              }
            ]
          }
        }
      }

      // Default: return current system timezone info
      const now = new Date()
      const systemOffset = now.getTimezoneOffset()
      const offsetHours = Math.floor(Math.abs(systemOffset) / 60)
      const offsetMinutes = Math.abs(systemOffset) % 60
      const offsetSign = systemOffset <= 0 ? '+' : '-'
      
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              systemTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              systemTime: now.toLocaleString(),
              utcTime: now.toISOString(),
              utcOffset: `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`,
              note: 'Use list=true to see available timezones, or specify a timezone parameter'
            }, null, 2)
          }
        ]
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Failed to get timezone information',
              message: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }
        ]
      }
    }
  }
)

// MCP endpoint using StreamableHTTPTransport (same pattern as Hatago main server)
app.all('/mcp', async c => {
  const transport = new StreamableHTTPTransport()
  await server.connect(transport)
  return transport.handleRequest(c)
})

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    server: 'external-mcp-clock',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  })
})

// Root endpoint with server info
app.get('/', (c) => {
  return c.json({
    name: 'External MCP Clock Server',
    version: '1.0.0',
    description: 'Simple MCP server providing clock and timezone functionality',
    mcp_endpoint: '/mcp',
    health_endpoint: '/health',
    tools: [
      {
        name: 'clock.getTime',
        description: 'Get current time in various formats and timezones'
      },
      {
        name: 'clock.getTimezone', 
        description: 'Get timezone information and list available timezones'
      }
    ]
  })
})

// Start server
const port = Number(process.env.PORT) || 8788
const hostname = process.env.HOSTNAME || 'localhost'

console.log(`🕐 External MCP Clock Server starting...`)
console.log(`   Server: http://${hostname}:${port}`)
console.log(`   Health: http://${hostname}:${port}/health`)
console.log(`   MCP:    http://${hostname}:${port}/mcp`)

serve({
  fetch: app.fetch,
  port,
  hostname,
})

console.log(`✅ Clock server running on http://${hostname}:${port}`)
console.log(`📋 Available tools: clock.getTime, clock.getTimezone`)