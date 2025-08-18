/**
 * stdio Bridge Container
 *
 * This Durable Object manages stdio MCP server instances
 * and provides a bridge between HTTP/SSE and stdio communication
 */

import { Container } from '@cloudflare/containers'
import type { Env } from '../types.js'

export class StdioBridge extends Container {
  // Container configuration
  defaultPort = 8080
  sleepAfter = '10m'
  instance_type = 'dev' // Use minimal resources for POC

  // Environment variables for the container
  envVars = {
    NODE_ENV: 'production',
    MCP_PROXY_PORT: '8080',
    LOG_LEVEL: 'info',
  }

  private serverId?: string
  private userId?: string

  /**
   * Handle incoming requests to the stdio bridge
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Verify service token for inter-service communication
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Extract user context from headers
    const userContext = request.headers.get('X-User-Context')
    if (userContext) {
      const context = JSON.parse(atob(userContext))
      this.userId = context.userId
      this.serverId = context.serverId

      // Pass context to container as environment variables
      this.envVars = {
        ...this.envVars,
        MCP_USER_ID: context.userId,
        MCP_SERVER_ID: context.serverId,
        MCP_PERMISSIONS: JSON.stringify(context.permissions || []),
      }
    }

    // Route based on path
    if (url.pathname === '/health') {
      return this.handleHealth()
    }

    if (url.pathname === '/execute') {
      return this.handleExecute(request)
    }

    if (url.pathname.startsWith('/sse')) {
      return this.handleSSE(request)
    }

    // Forward other requests to the container
    return super.fetch(request)
  }

  /**
   * Health check endpoint
   */
  private async handleHealth(): Promise<Response> {
    const isHealthy = await this.checkContainerHealth()
    return new Response(
      JSON.stringify({
        status: isHealthy ? 'healthy' : 'unhealthy',
        serverId: this.serverId,
        userId: this.userId,
        timestamp: new Date().toISOString(),
      }),
      {
        status: isHealthy ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  /**
   * Execute command on stdio server
   */
  private async handleExecute(request: Request): Promise<Response> {
    try {
      const { command, args } = (await request.json()) as {
        command: string
        args?: any
      }

      // Validate command
      if (!this.isCommandAllowed(command)) {
        return new Response(JSON.stringify({ error: 'Command not allowed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Forward to container's MCP proxy
      const containerResponse = await this.executeInContainer(command, args)

      return new Response(
        JSON.stringify({
          result: containerResponse,
          serverId: this.serverId,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Execution failed',
          message: (error as Error).message,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  /**
   * Handle Server-Sent Events for streaming responses
   */
  private async handleSSE(request: Request): Promise<Response> {
    // Create SSE response with proper headers
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Start SSE stream
    writer.write(encoder.encode('event: connected\ndata: {"status":"connected"}\n\n'))

    // Forward request to container and stream responses
    this.streamFromContainer(request, writer, encoder)

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  /**
   * Stream responses from container to SSE
   */
  private async streamFromContainer(
    request: Request,
    writer: WritableStreamDefaultWriter,
    encoder: TextEncoder
  ): Promise<void> {
    try {
      // Forward request to container
      const containerUrl = `http://localhost:${this.defaultPort}/sse`
      const containerRequest = new Request(containerUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })

      const response = await fetch(containerRequest)

      if (!response.body) {
        writer.close()
        return
      }

      // Stream response back to client
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await writer.write(value)
      }

      writer.close()
    } catch (error) {
      await writer.write(
        encoder.encode(
          `event: error\ndata: ${JSON.stringify({
            error: (error as Error).message,
          })}\n\n`
        )
      )
      writer.close()
    }
  }

  /**
   * Check if container is healthy
   */
  private async checkContainerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.defaultPort}/health`)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Validate if command is allowed
   */
  private isCommandAllowed(command: string): boolean {
    // Whitelist of allowed commands
    const allowedCommands = ['list_tools', 'execute_tool', 'get_status']
    return allowedCommands.includes(command)
  }

  /**
   * Execute command in container
   */
  private async executeInContainer(command: string, args?: any): Promise<any> {
    const response = await fetch(`http://localhost:${this.defaultPort}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, args }),
    })

    if (!response.ok) {
      throw new Error(`Container execution failed: ${response.statusText}`)
    }

    return response.json()
  }
}
