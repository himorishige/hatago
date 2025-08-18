/**
 * MCP API Handler using WorkerEntrypoint
 *
 * This handler processes authenticated MCP requests
 */

import { WorkerEntrypoint } from 'cloudflare:workers'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { DeepWikiClient } from '../mcp/deepwiki-client.js'
import { PermissionManager } from '../mcp/permissions.js'
import type { AuthContext, Env } from '../types.js'

export class MCPApiHandler extends WorkerEntrypoint<Env> {
  private registeredTools: Map<string, any> = new Map()
  private deepwikiClients: Map<string, DeepWikiClient> = new Map()

  async fetch(request: Request): Promise<Response> {
    // Extract auth context from OAuthProvider
    // The OAuthProvider sets this.ctx.props with the grant's props
    const authContext: AuthContext | undefined = this.ctx.props
      ? {
          claims: {
            sub: this.ctx.props.userId || 'unknown',
            email: this.ctx.props.email,
            name: this.ctx.props.name,
            groups: this.ctx.props.groups || [],
            permissions: this.ctx.props.permissions || [],
          },
          accessToken: '', // Token is handled by OAuthProvider
        }
      : undefined

    try {
      // Parse the JSON-RPC request
      const body = await request.text()
      let jsonRpcRequest
      try {
        jsonRpcRequest = JSON.parse(body)
      } catch {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
            id: null,
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      // Create MCP server
      const server = new McpServer({
        name: 'hatago-auth-poc',
        version: '0.1.0',
      })

      const permManager = authContext ? new PermissionManager(this.env) : null

      // Initialize DeepWiki client for authenticated users
      let deepwikiClient: DeepWikiClient | null = null
      if (authContext?.claims?.sub) {
        deepwikiClient = await this.getOrCreateDeepWikiClient(authContext.claims.sub)
      }

      // Register tools based on authentication
      const helloTool = {
        name: 'hello',
        description: 'Simple greeting tool',
        inputSchema: z.object({}).strict(),
        handler: async () => ({
          content: [
            {
              type: 'text',
              text: `Hello, ${authContext?.claims?.name || 'User'}! Your ID is: ${authContext?.claims?.sub || 'unknown'}`,
            },
          ],
        }),
      }
      this.registeredTools.set('hello', helloTool)
      server.tool('hello', 'Simple greeting tool', z.object({}), helloTool.handler)

      // List available stdio servers
      const listServersTool = {
        name: 'list_servers',
        description: 'List available stdio MCP servers',
        inputSchema: z.object({}).strict(),
        handler: async () => {
          const servers = await this.getAvailableServers()
          return {
            content: [
              {
                type: 'text',
                text: `Available servers:\n${servers.map(s => `- ${s.id}: ${s.name}`).join('\n')}`,
              },
            ],
          }
        },
      }
      this.registeredTools.set('list_servers', listServersTool)
      server.tool(
        'list_servers',
        'List available stdio MCP servers',
        z.object({}),
        listServersTool.handler
      )

      // Register DeepWiki proxy tools based on permissions
      if (deepwikiClient && authContext) {
        await this.registerDeepWikiTools(deepwikiClient, authContext)
      }

      // Execute command on stdio server (with permission check)
      if (authContext?.claims?.permissions?.includes('execute')) {
        const executeStdioTool = {
          name: 'execute_stdio',
          description: 'Execute command on stdio MCP server',
          inputSchema: z
            .object({
              serverId: z.string().describe('ID of the stdio server'),
              command: z.string().describe('Command to execute'),
              args: z.record(z.any()).optional().describe('Command arguments'),
            })
            .strict(),
          handler: async ({ serverId, command, args }: any) => {
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

            return {
              content: [
                {
                  type: 'text',
                  text: `[Mock] Executed ${command} on ${serverId} with args: ${JSON.stringify(args)}`,
                },
              ],
            }
          },
        }
        this.registeredTools.set('execute_stdio', executeStdioTool)
        server.tool(
          'execute_stdio',
          'Execute command on stdio MCP server',
          executeStdioTool.inputSchema,
          executeStdioTool.handler
        )
      }

      // Handle the JSON-RPC request directly
      let result

      // Handle different methods
      switch (jsonRpcRequest.method) {
        case 'initialize':
          result = {
            jsonrpc: '2.0',
            result: {
              protocolVersion: '2025-06-18',
              serverInfo: {
                name: 'hatago-auth-poc',
                version: '0.1.0',
              },
              capabilities: {
                tools: {},
              },
            },
            id: jsonRpcRequest.id,
          }
          break

        case 'tools/list': {
          // Return the list of registered tools with proper JSON Schema
          const tools = Array.from(this.registeredTools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            // Check if inputSchema is already JSON Schema or needs conversion
            inputSchema: tool.inputSchema._def
              ? zodToJsonSchema(tool.inputSchema)
              : tool.inputSchema,
          }))
          result = {
            jsonrpc: '2.0',
            result: {
              tools,
            },
            id: jsonRpcRequest.id,
          }
          break
        }

        case 'tools/call':
          try {
            const toolName = jsonRpcRequest.params.name
            const tool = this.registeredTools.get(toolName)

            if (!tool) {
              result = {
                jsonrpc: '2.0',
                error: {
                  code: -32601,
                  message: `Tool not found: ${toolName}`,
                },
                id: jsonRpcRequest.id,
              }
            } else {
              // Validate arguments with the schema
              const args = jsonRpcRequest.params.arguments || {}

              // Check if inputSchema is Zod or JSON Schema
              let validatedArgs = args
              if (tool.inputSchema._def) {
                // Zod schema - validate with parse
                validatedArgs = tool.inputSchema.parse(args)
              }
              // For JSON Schema, skip validation for now (could add ajv later)

              // Call the tool handler
              const toolResult = await tool.handler(validatedArgs)
              result = {
                jsonrpc: '2.0',
                result: toolResult,
                id: jsonRpcRequest.id,
              }
            }
          } catch (error) {
            result = {
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: error instanceof Error ? error.message : 'Internal error',
              },
              id: jsonRpcRequest.id,
            }
          }
          break

        default:
          result = {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: 'Method not found',
            },
            id: jsonRpcRequest.id,
          }
      }

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('MCP handler error:', error)
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error',
          },
          id: null,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  private async getAvailableServers() {
    try {
      // Query the database for available servers
      const result = await this.env.PERMISSIONS_DB.prepare(
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

  /**
   * Get or create DeepWiki client for a user
   */
  private async getOrCreateDeepWikiClient(userId: string): Promise<DeepWikiClient> {
    // Check if client already exists
    let client = this.deepwikiClients.get(userId)
    if (client?.isInitialized()) {
      return client
    }

    // Check KV for existing session
    const kvKey = `deepwiki_session_${userId}`
    const _storedSession = await this.env.OAUTH_KV.get(kvKey)

    // Create new client
    client = new DeepWikiClient(userId)

    try {
      // Initialize client (will get new session from DeepWiki)
      await client.initialize()

      // Store session in KV for reuse (1 hour TTL)
      const sessionData = {
        sessionId: client.getSessionId(),
        createdAt: Date.now(),
      }
      await this.env.OAUTH_KV.put(kvKey, JSON.stringify(sessionData), {
        expirationTtl: 3600,
      })

      // Cache client
      this.deepwikiClients.set(userId, client)

      console.log(`Created new DeepWiki client for user ${userId}`)
      return client
    } catch (error) {
      console.error('Failed to initialize DeepWiki client:', error)
      throw error
    }
  }

  /**
   * Register DeepWiki tools with permission filtering
   */
  private async registerDeepWikiTools(
    client: DeepWikiClient,
    authContext: AuthContext
  ): Promise<void> {
    try {
      const tools = await client.listTools()

      // Permission mapping for DeepWiki tools
      const toolPermissions: Record<string, string> = {
        read_wiki_structure: 'read',
        read_wiki_contents: 'read',
        ask_question: 'execute',
      }

      for (const tool of tools) {
        const requiredPermission = toolPermissions[tool.name]

        // Check if user has required permission
        if (!requiredPermission || authContext.claims.permissions?.includes(requiredPermission)) {
          // Register proxy tool with 'deepwiki:' prefix
          const proxyToolName = `deepwiki:${tool.name}`

          const proxyTool = {
            name: proxyToolName,
            description: `[DeepWiki] ${tool.description}`,
            inputSchema: tool.inputSchema,
            handler: async (args: any) => {
              try {
                console.log(`Calling DeepWiki tool ${tool.name} for user ${authContext.claims.sub}`)
                const result = await client.callTool(tool.name, args)
                return result
              } catch (error) {
                console.error('DeepWiki tool error:', error)
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Error calling DeepWiki: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    },
                  ],
                }
              }
            },
          }

          this.registeredTools.set(proxyToolName, proxyTool)
          console.log(
            `Registered DeepWiki tool: ${proxyToolName} for user ${authContext.claims.sub}`
          )
        }
      }
    } catch (error) {
      console.error('Failed to register DeepWiki tools:', error)
    }
  }
}
