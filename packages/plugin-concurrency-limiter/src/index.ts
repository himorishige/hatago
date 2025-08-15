import type { CapabilityAwarePluginFactory, PluginContext, CapabilityAwarePlugin, CapabilityRegistry } from '@hatago/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Context } from 'hono'

export interface ConcurrencyLimiterConfig {
  /** Enable concurrency limiting */
  enabled?: boolean
  /** Maximum concurrent requests */
  maxConcurrency?: number
  /** Maximum queue size for waiting requests */
  maxQueueSize?: number
  /** Request timeout in milliseconds */
  timeoutMs?: number
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number
  /** Circuit breaker reset timeout in milliseconds */
  circuitBreakerResetMs?: number
  /** Paths to exclude from limiting */
  excludePaths?: string[]
}

interface RequestEntry {
  resolve: (value: any) => void
  reject: (reason: any) => void
  timestamp: number
  timeout: ReturnType<typeof setTimeout>
}

enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Concurrency limiting plugin with circuit breaker and queue management
 * Protects against overload with graceful degradation
 */
const concurrencyLimiterPlugin: CapabilityAwarePluginFactory = (context: PluginContext): CapabilityAwarePlugin => {
  const config: ConcurrencyLimiterConfig = {
    enabled: true,
    maxConcurrency: 1000,
    maxQueueSize: 500,
    timeoutMs: 30000,
    circuitBreakerThreshold: 10,
    circuitBreakerResetMs: 60000,
    excludePaths: ['/health', '/metrics', '/drain'],
    ...context.config as ConcurrencyLimiterConfig
  }
  
  return async ({ server, capabilities }: { server: McpServer; capabilities: CapabilityRegistry }) => {
    if (!config.enabled) {
      return
    }

    const { logger } = capabilities
    
    // State tracking
    let activeRequests = 0
    const requestQueue: RequestEntry[] = []
    let circuitState = CircuitState.CLOSED
    let consecutiveFailures = 0
    let lastCircuitOpenTime = 0

    // Metrics
    let totalRequests = 0
    let rejectedRequests = 0
    let queuedRequests = 0
    let timeoutRequests = 0

    // Circuit breaker functions
    const isCircuitOpen = (): boolean => {
      if (circuitState === CircuitState.OPEN) {
        const now = Date.now()
        if (now - lastCircuitOpenTime > config.circuitBreakerResetMs!) {
          circuitState = CircuitState.HALF_OPEN
          logger.info('Circuit breaker half-open', { plugin: context.manifest.name })
          return false
        }
        return true
      }
      return false
    }

    const recordSuccess = () => {
      if (circuitState === CircuitState.HALF_OPEN) {
        circuitState = CircuitState.CLOSED
        consecutiveFailures = 0
        logger.info('Circuit breaker closed', { plugin: context.manifest.name })
      } else if (circuitState === CircuitState.CLOSED) {
        consecutiveFailures = Math.max(0, consecutiveFailures - 1)
      }
    }

    const recordFailure = () => {
      consecutiveFailures++
      if (consecutiveFailures >= config.circuitBreakerThreshold!) {
        circuitState = CircuitState.OPEN
        lastCircuitOpenTime = Date.now()
        logger.warn('Circuit breaker opened', { 
          plugin: context.manifest.name,
          consecutiveFailures,
          threshold: config.circuitBreakerThreshold
        })
      }
    }

    // Request processing functions
    const shouldBypassLimiting = (path: string): boolean => {
      return config.excludePaths!.some(excludePath => 
        path.startsWith(excludePath)
      )
    }

    const processQueue = () => {
      while (requestQueue.length > 0 && activeRequests < config.maxConcurrency!) {
        const entry = requestQueue.shift()!
        activeRequests++
        entry.resolve(true)
      }
    }

    const acquireSlot = async (path: string): Promise<boolean> => {
      totalRequests++

      // Check circuit breaker
      if (isCircuitOpen()) {
        rejectedRequests++
        throw new Error('Circuit breaker is open')
      }

      // Check if we can proceed immediately
      if (activeRequests < config.maxConcurrency!) {
        activeRequests++
        return true
      }

      // Check queue capacity
      if (requestQueue.length >= config.maxQueueSize!) {
        rejectedRequests++
        throw new Error('Request queue full')
      }

      // Queue the request
      queuedRequests++
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          timeoutRequests++
          // Remove from queue if still there
          const index = requestQueue.findIndex(entry => entry.resolve === resolve)
          if (index !== -1) {
            requestQueue.splice(index, 1)
          }
          reject(new Error('Request timeout in queue'))
        }, config.timeoutMs!)

        requestQueue.push({
          resolve,
          reject,
          timestamp: Date.now(),
          timeout
        })
      })
    }

    const releaseSlot = () => {
      activeRequests = Math.max(0, activeRequests - 1)
      processQueue()
    }

    // Note: Middleware registration is not available in CapabilityAwarePlugin
    // Concurrency limiting would need to be implemented at the application level
    // For now, we provide monitoring and control tools

    // Register circuit breaker test tool
    server.registerTool(
      'concurrency.test',
      {
        title: 'Test Concurrency Limiter',
        description: 'Test the concurrency limiter circuit breaker functionality',
        inputSchema: {}
      },
      async (args: any) => {
        const { action, count = 1 } = args
        
        switch (action) {
          case 'trigger_failure':
            for (let i = 0; i < count; i++) {
              recordFailure()
            }
            break
            
          case 'trigger_success':
            for (let i = 0; i < count; i++) {
              recordSuccess()
            }
            break
            
          case 'reset_circuit':
            circuitState = CircuitState.CLOSED
            consecutiveFailures = 0
            break
            
          case 'simulate_load':
            // Simulate concurrent requests
            for (let i = 0; i < count; i++) {
              totalRequests++
              if (activeRequests < config.maxConcurrency!) {
                activeRequests++
                // Simulate request completion after random delay
                setTimeout(() => {
                  releaseSlot()
                  recordSuccess()
                }, Math.random() * 1000)
              } else {
                rejectedRequests++
              }
            }
            break
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Action '${action}' executed. Current state: ${circuitState}, Active requests: ${activeRequests}, Consecutive failures: ${consecutiveFailures}`
            }
          ]
        }
      }
    )

    // Register monitoring tool
    server.registerTool(
      'concurrency.status',
      {
        title: 'Concurrency Status',
        description: 'Get current concurrency limiter status and metrics',
        inputSchema: {}
      },
      async () => {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                active_requests: activeRequests,
                queue_length: requestQueue.length,
                circuit_state: circuitState,
                consecutive_failures: consecutiveFailures,
                config: {
                  max_concurrency: config.maxConcurrency,
                  max_queue_size: config.maxQueueSize,
                  timeout_ms: config.timeoutMs,
                  circuit_breaker_threshold: config.circuitBreakerThreshold
                },
                metrics: {
                  total_requests: totalRequests,
                  rejected_requests: rejectedRequests,
                  queued_requests: queuedRequests,
                  timeout_requests: timeoutRequests,
                  rejection_rate: totalRequests > 0 ? (rejectedRequests / totalRequests * 100).toFixed(2) + '%' : '0%'
                }
              }, null, 2)
            }
          ]
        }
      }
    )

    logger.info('Concurrency limiter initialized', {
      plugin: context.manifest.name,
      maxConcurrency: config.maxConcurrency,
      maxQueueSize: config.maxQueueSize,
      timeoutMs: config.timeoutMs,
      circuitBreakerThreshold: config.circuitBreakerThreshold
    })

    // Cleanup function - but CapabilityAwarePlugin should return void
    // Store cleanup for later use if needed
    const cleanup = () => {
      // Clear any pending timeouts
      for (const entry of requestQueue) {
        clearTimeout(entry.timeout)
        entry.reject(new Error('Plugin shutting down'))
      }
      requestQueue.length = 0
    }
    
    // TODO: Implement proper cleanup mechanism in plugin lifecycle
  }
}

export default concurrencyLimiterPlugin