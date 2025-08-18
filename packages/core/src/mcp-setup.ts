import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { Hono } from 'hono'
import { createDefaultLogger } from './logger/index.js'
import { type SessionData, SessionManager } from './session/index.js'

const logger = createDefaultLogger('mcp-setup')

// Module-level unified session management
const sessionManager = new SessionManager({
  ttlMs: 30 * 60 * 1000, // 30 minutes
  cleanupIntervalMs: 60 * 1000, // 1 minute
  maxSessions: 1000,
})

/**
 * Session context interface for MCP tools
 */
export interface MCPSessionContext {
  /** Current session ID */
  sessionId: string | undefined
  /** Session store for plugin data */
  sessionStore: {
    get: (sessionId: string) => SessionData | undefined
    setPluginData: (sessionId: string, key: string, data: unknown) => void
    getPluginData: (sessionId: string, key: string) => unknown
    deletePluginData: (sessionId: string, key: string) => void
    rotateSession: (oldId: string, newId: string) => boolean
  }
}

/**
 * Plugin-scoped session context with namespace isolation
 */
export interface PluginSessionContext {
  /** Current session ID */
  sessionId: string | undefined
  /** Plugin-scoped session store */
  sessionStore: {
    /** Set data for this plugin only */
    set: (key: string, data: unknown) => void
    /** Get data for this plugin only */
    get: (key: string) => unknown
    /** Delete data for this plugin only */
    delete: (key: string) => void
  }
}

/**
 * Create plugin-scoped session context with namespace isolation
 * @param server MCP server instance
 * @param pluginId Unique plugin identifier for namespace isolation
 * @returns Plugin-scoped session context
 */
export function createPluginSessionContext(server: any, pluginId: string): PluginSessionContext {
  const sessionContext = server.getSessionContext?.() as MCPSessionContext | undefined

  if (!sessionContext?.sessionId) {
    // Return dummy context if no session available
    return {
      sessionId: undefined,
      sessionStore: {
        set: () => {},
        get: () => undefined,
        delete: () => {},
      },
    }
  }

  // Create namespaced plugin key prefix
  const createPluginKey = (key: string) => `plugin:${pluginId}:${key}`

  return {
    sessionId: sessionContext.sessionId,
    sessionStore: {
      set: (key: string, data: unknown) => {
        sessionContext.sessionStore.setPluginData(
          sessionContext.sessionId!,
          createPluginKey(key),
          data
        )
      },
      get: (key: string) => {
        return sessionContext.sessionStore.getPluginData(
          sessionContext.sessionId!,
          createPluginKey(key)
        )
      },
      delete: (key: string) => {
        sessionContext.sessionStore.deletePluginData(
          sessionContext.sessionId!,
          createPluginKey(key)
        )
      },
    },
  }
}

/**
 * Configure MCP endpoint for HTTP transport with session management
 * This function sets up the standard /mcp endpoint with multi-user session support
 */
export const setupMCPEndpoint = (app: Hono, server: McpServer): void => {
  app.all('/mcp', async c => {
    const sessionId = c.req.header('mcp-session-id')

    // Get existing session or create new one
    let sessionRecord = sessionId ? sessionManager.getSession(sessionId) : undefined

    if (!sessionRecord) {
      // Create new session with transport
      sessionRecord = sessionManager.createSession()

      logger.info('New MCP session created', {
        totalSessions: sessionManager.size(),
      })
    } else {
      logger.debug('Existing MCP session accessed', {
        totalSessions: sessionManager.size(),
      })
    }

    // Create session context for server
    const sessionContext: MCPSessionContext = {
      sessionId: sessionRecord.id,
      sessionStore: {
        get: id => sessionManager.getSession(id)?.data,
        setPluginData: (id, key, data) => {
          sessionManager.setPluginData(id, key, data)
        },
        getPluginData: (id, key) => {
          return sessionManager.getPluginData(id, key)
        },
        deletePluginData: (id, key) => {
          sessionManager.deletePluginData(id, key)
        },
        rotateSession: (oldId, newId) => {
          return sessionManager.rotateSession(oldId, newId)
        },
      },
    }

    // Inject session context into server with getter function
    ;(server as any).sessionContext = sessionContext
    ;(server as any).getSessionContext = () => sessionContext

    await server.connect(sessionRecord.transport as Transport)
    return sessionRecord.transport.handleRequest(c)
  })

  // Cleanup function for graceful shutdown
  const cleanup = () => {
    sessionManager.destroy()
    logger.info('MCP session management cleaned up')
  }

  // Register cleanup handlers
  if (typeof process !== 'undefined') {
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  }

  // Export cleanup for manual use
  ;(setupMCPEndpoint as any).cleanup = cleanup
}
