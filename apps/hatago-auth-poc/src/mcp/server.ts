/**
 * MCP Server implementation with authentication context
 */

import { StreamableHTTPTransport } from '@hatago/hono-mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Context } from 'hono'
import { z } from 'zod'
import type { AuthContext, Env } from '../types.js'
import { PermissionManager } from './permissions.js'

/**
 * Create MCP server with authentication context
 */
export function createMCPServer(env: Env, authContext?: AuthContext) {
  const server = new McpServer({
    name: 'hatago-auth-poc',
    version: '0.1.0',
  })

  const permManager = authContext ? new PermissionManager(env) : null

  // Basic tool available to all authenticated users
  server.tool('hello', 'Simple greeting tool', z.object({}), async () => ({
    content: [
      {
        type: 'text',
        text: `Hello, ${authContext?.claims?.name || 'User'}! Your ID is: ${authContext?.claims?.sub || 'unknown'}`,
      },
    ],
  }))

  // List available stdio servers
  server.tool('list_servers', 'List available stdio MCP servers', z.object({}), async () => {
    const servers = await getAvailableServers(env)
    return {
      content: [
        {
          type: 'text',
          text: `Available servers:\n${servers.map(s => `- ${s.id}: ${s.name}`).join('\n')}`,
        },
      ],
    }
  })

  // Execute command on stdio server (with permission check)
  if (authContext?.claims?.permissions?.includes('execute')) {
    server.tool(
      'execute_stdio',
      'Execute command on stdio MCP server',
      z.object({
        serverId: z.string().describe('ID of the stdio server'),
        command: z.string().describe('Command to execute'),
        args: z.record(z.any()).optional().describe('Command arguments'),
      }),
      async ({ serverId, command, args }) => {
        // Check if user has access to this server
        const userId = authContext?.claims?.sub
        if (!userId || !permManager) {
          return {
            content: [
              {
                type: 'text',
                text: 'Authentication required',
              },
            ],
          }
        }

        const hasAccess = await permManager.hasServerAccess(userId, serverId)
        if (!hasAccess) {
          return {
            content: [
              {
                type: 'text',
                text: `Permission denied: You don't have access to server ${serverId}`,
              },
            ],
          }
        }

        // Execute on stdio server via container
        const result = await executeOnStdioServer(env, serverId, command, args)
        return {
          content: [
            {
              type: 'text',
              text: `Executed ${command} on ${serverId}:\n${result}`,
            },
          ],
        }
      }
    )
  }

  // Admin-only tool
  if (authContext?.claims?.groups?.includes('admin')) {
    server.tool(
      'manage_permissions',
      'Manage user permissions (Admin only)',
      z.object({
        userId: z.string().describe('User ID to manage'),
        action: z.enum(['grant', 'revoke']).describe('Permission action'),
        permission: z.string().describe('Permission to grant/revoke'),
      }),
      async ({ userId, action, permission }) => {
        if (!permManager) {
          return {
            content: [
              {
                type: 'text',
                text: 'Permission manager not available',
              },
            ],
          }
        }

        if (action === 'grant') {
          await permManager.grantPermission(userId, permission)
        } else {
          await permManager.revokePermission(userId, permission)
        }

        return {
          content: [
            {
              type: 'text',
              text: `${action === 'grant' ? 'Granted' : 'Revoked'} permission '${permission}' for user ${userId}`,
            },
          ],
        }
      }
    )
  }

  return {
    server,
    // Provide handler for both SSE and regular HTTP
    serve: (_path: string) => async (ctx: Context) => {
      const transport = new StreamableHTTPTransport({
        enableJsonResponse: true,
      })

      await server.connect(transport)

      // Let the transport handle the request
      const response = await transport.handleRequest(ctx)
      if (response) {
        return response
      }

      // Fallback if no response
      return ctx.json({ error: 'Failed to handle request' }, 500)
    },
  }
}

async function getAvailableServers(env: Env) {
  try {
    // Query the database for available servers
    const result = await env.PERMISSIONS_DB.prepare(
      'SELECT server_id, server_name FROM server_registry WHERE status = ?'
    )
      .bind('active')
      .all()

    return result.results.map((row: any) => ({
      id: row.server_id,
      name: row.server_name,
    }))
  } catch {
    // Return default servers if database query fails
    return [
      { id: 'test-stdio-1', name: 'Test stdio Server 1' },
      { id: 'test-stdio-2', name: 'Test stdio Server 2' },
    ]
  }
}

async function executeOnStdioServer(
  env: Env,
  serverId: string,
  command: string,
  args?: any
): Promise<string> {
  try {
    // Get the container ID for this server
    const serverInfo = await env.PERMISSIONS_DB.prepare(
      'SELECT container_id FROM server_registry WHERE server_id = ?'
    )
      .bind(serverId)
      .first()

    if (!serverInfo?.container_id) {
      return `Server ${serverId} not found or not active`
    }

    // This would communicate with the stdio bridge container
    // For local dev, containers don't work, so return mock response
    if (env.ENVIRONMENT === 'development') {
      return `[Mock] Executed ${command} on ${serverId} with args: ${JSON.stringify(args)}`
    }

    // In production, would use Durable Object to communicate with container
    const id = env.STDIO_BRIDGE.idFromName(serverInfo.container_id as string)
    const stub = env.STDIO_BRIDGE.get(id)

    const response = await stub.fetch('http://internal/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, args }),
    })

    return await response.text()
  } catch (error) {
    return `Error executing command: ${error}`
  }
}
