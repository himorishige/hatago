/**
 * Runner Plugin for Hatago
 * Manages MCP servers via npx and other package managers
 */

import { RunnerManager } from '@hatago/core/runner'
import { z } from 'zod'
import type { HatagoContext, HatagoPlugin } from '../system/types.js'
import { logger } from '../utils/logger.js'

/**
 * Runner plugin configuration
 */
const RunnerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoStart: z.boolean().default(true),
  configFile: z.string().optional(),
  servers: z.array(z.any()).optional(), // Will be validated by RunnerManager
})

type RunnerConfig = z.infer<typeof RunnerConfigSchema>

/**
 * Create the Runner plugin
 */
export function createRunnerPlugin(config?: Partial<RunnerConfig>): HatagoPlugin {
  const finalConfig = RunnerConfigSchema.parse(config || {})

  return async (ctx: HatagoContext) => {
    if (!finalConfig.enabled) {
      logger.info('Runner plugin disabled')
      return
    }

    logger.info('Initializing Runner plugin')

    // Create runner manager
    const manager = (new RunnerManager({
      servers: finalConfig.servers || [],
    })(
      // Store manager in context for other plugins
      ctx as any
    ).runnerManager = manager)

    // Register API endpoints
    const { app } = ctx

    // List registered servers
    app.get('/api/runner/servers', async c => {
      const servers = manager.listServers()
      return c.json({
        servers: servers.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          package: s.package,
          version: s.version,
          transport: s.transport,
          autoStart: s.autoStart,
        })),
      })
    })

    // List running servers
    app.get('/api/runner/running', async c => {
      const running = manager.listRunningServers()
      return c.json({
        servers: running.map(s => ({
          id: s.id,
          state: s.state,
          pid: s.pid,
          startTime: s.startTime,
          restartCount: s.restartCount,
        })),
      })
    })

    // Start a server
    app.post('/api/runner/servers/:id/start', async c => {
      const { id } = c.req.param()

      try {
        const process = await manager.startServer(id, {
          waitForConnection: true,
          connectionTimeout: 10000,
        })

        return c.json({
          success: true,
          process: {
            id: process.id,
            state: process.state,
            pid: process.pid,
            startTime: process.startTime,
          },
        })
      } catch (error) {
        logger.error('Failed to start server', {
          id,
          error: error instanceof Error ? error.message : String(error),
        })

        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to start server',
          },
          500
        )
      }
    })

    // Stop a server
    app.post('/api/runner/servers/:id/stop', async c => {
      const { id } = c.req.param()
      const { force } = await c.req.json().catch(() => ({ force: false }))

      try {
        await manager.stopServer(id, force)

        return c.json({
          success: true,
          message: `Server ${id} stopped`,
        })
      } catch (error) {
        logger.error('Failed to stop server', {
          id,
          error: error instanceof Error ? error.message : String(error),
        })

        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to stop server',
          },
          500
        )
      }
    })

    // Restart a server
    app.post('/api/runner/servers/:id/restart', async c => {
      const { id } = c.req.param()

      try {
        const process = await manager.restartServer(id)

        return c.json({
          success: true,
          process: {
            id: process.id,
            state: process.state,
            pid: process.pid,
            startTime: process.startTime,
            restartCount: process.restartCount,
          },
        })
      } catch (error) {
        logger.error('Failed to restart server', {
          id,
          error: error instanceof Error ? error.message : String(error),
        })

        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to restart server',
          },
          500
        )
      }
    })

    // Health check
    app.get('/api/runner/servers/:id/health', async c => {
      const { id } = c.req.param()

      try {
        const healthy = await manager.healthCheck(id)
        const process = manager.sandbox.getProcess(id)

        return c.json({
          id,
          healthy,
          state: process?.state,
          pid: process?.pid,
          uptime: process?.startTime ? Date.now() - process.startTime.getTime() : undefined,
        })
      } catch (error) {
        return c.json(
          {
            id,
            healthy: false,
            error: error instanceof Error ? error.message : 'Health check failed',
          },
          500
        )
      }
    })

    // Register a new server manifest
    app.post('/api/runner/servers', async c => {
      try {
        const manifest = await c.req.json()
        manager.registerManifest(manifest)

        return c.json({
          success: true,
          message: `Server ${manifest.id} registered`,
        })
      } catch (error) {
        logger.error('Failed to register server', {
          error: error instanceof Error ? error.message : String(error),
        })

        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Invalid manifest',
          },
          400
        )
      }
    })

    // Register MCP tools for runner management
    ctx.server.registerTool(
      'runner_list_servers',
      {
        title: 'List Runner Servers',
        description: 'List all registered MCP servers',
        inputSchema: z.object({}),
      },
      async () => {
        const servers = manager.listServers()
        const running = manager.listRunningServers()
        const runningIds = new Set(running.map(r => r.id))

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  registered: servers.map(s => ({
                    id: s.id,
                    name: s.name,
                    package: s.package,
                    running: runningIds.has(s.id),
                  })),
                  running: running.length,
                  total: servers.length,
                },
                null,
                2
              ),
            },
          ],
        }
      }
    )

    ctx.server.registerTool(
      'runner_start_server',
      {
        title: 'Start Runner Server',
        description: 'Start an MCP server by ID',
        inputSchema: z.object({
          serverId: z.string(),
        }),
      },
      async ({ serverId }) => {
        try {
          const process = await manager.startServer(serverId, {
            waitForConnection: true,
          })

          return {
            content: [
              {
                type: 'text',
                text: `Started server ${serverId} (PID: ${process.pid})`,
              },
            ],
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          }
        }
      }
    )

    ctx.server.registerTool(
      'runner_stop_server',
      {
        title: 'Stop Runner Server',
        description: 'Stop an MCP server by ID',
        inputSchema: z.object({
          serverId: z.string(),
          force: z.boolean().optional(),
        }),
      },
      async ({ serverId, force }) => {
        try {
          await manager.stopServer(serverId, force)

          return {
            content: [
              {
                type: 'text',
                text: `Stopped server ${serverId}`,
              },
            ],
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to stop server: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          }
        }
      }
    )

    // Auto-start servers if configured
    if (finalConfig.autoStart) {
      // Delay auto-start to ensure everything is initialized
      setTimeout(() => {
        manager.autoStart().catch(error => {
          logger.error('Auto-start failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }, 1000)
    }

    // Cleanup on shutdown
    if (typeof process !== 'undefined') {
      const cleanup = async () => {
        logger.info('Shutting down Runner plugin')
        await manager.stopAll()
      }

      process.on('SIGINT', cleanup)
      process.on('SIGTERM', cleanup)
    }

    logger.info('Runner plugin initialized', {
      servers: manager.listServers().length,
      autoStart: finalConfig.autoStart,
    })
  }
}

// Export as default runner plugin
export const runnerPlugin: HatagoPlugin = createRunnerPlugin()
