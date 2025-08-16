import type {
  CapabilityAwarePlugin,
  CapabilityAwarePluginFactory,
  CapabilityRegistry,
  PluginContext,
} from '@hatago/core'
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
  HALF_OPEN = 'half_open',
}

/**
 * Immutable state for concurrency limiter
 */
interface LimiterState {
  readonly activeRequests: number
  readonly requestQueue: readonly RequestEntry[]
  readonly circuitState: CircuitState
  readonly consecutiveFailures: number
  readonly lastCircuitOpenTime: number
  readonly totalRequests: number
  readonly rejectedRequests: number
  readonly queuedRequests: number
  readonly timeoutRequests: number
}

/**
 * Actions for state updates
 */
type LimiterAction =
  | { type: 'ACQUIRE_SLOT' }
  | { type: 'RELEASE_SLOT' }
  | { type: 'ADD_TO_QUEUE'; entry: RequestEntry }
  | { type: 'REMOVE_FROM_QUEUE'; index: number }
  | { type: 'RECORD_SUCCESS' }
  | { type: 'RECORD_FAILURE'; timestamp: number }
  | { type: 'RESET_CIRCUIT' }
  | { type: 'OPEN_CIRCUIT'; timestamp: number }
  | { type: 'SET_HALF_OPEN' }
  | { type: 'INCREMENT_REJECTED' }
  | { type: 'INCREMENT_QUEUED' }
  | { type: 'INCREMENT_TIMEOUT' }

/**
 * Create initial limiter state
 */
function createInitialState(): LimiterState {
  return {
    activeRequests: 0,
    requestQueue: [],
    circuitState: CircuitState.CLOSED,
    consecutiveFailures: 0,
    lastCircuitOpenTime: 0,
    totalRequests: 0,
    rejectedRequests: 0,
    queuedRequests: 0,
    timeoutRequests: 0,
  }
}

/**
 * Pure reducer for state updates
 */
function limiterReducer(state: LimiterState, action: LimiterAction): LimiterState {
  switch (action.type) {
    case 'ACQUIRE_SLOT':
      return {
        ...state,
        activeRequests: state.activeRequests + 1,
        totalRequests: state.totalRequests + 1,
      }

    case 'RELEASE_SLOT':
      return {
        ...state,
        activeRequests: Math.max(0, state.activeRequests - 1),
      }

    case 'ADD_TO_QUEUE':
      return {
        ...state,
        requestQueue: [...state.requestQueue, action.entry],
        queuedRequests: state.queuedRequests + 1,
      }

    case 'REMOVE_FROM_QUEUE':
      return {
        ...state,
        requestQueue: state.requestQueue.filter((_, index) => index !== action.index),
      }

    case 'RECORD_SUCCESS':
      if (state.circuitState === CircuitState.HALF_OPEN) {
        return {
          ...state,
          circuitState: CircuitState.CLOSED,
          consecutiveFailures: 0,
        }
      }
      if (state.circuitState === CircuitState.CLOSED) {
        return {
          ...state,
          consecutiveFailures: Math.max(0, state.consecutiveFailures - 1),
        }
      }
      return state

    case 'RECORD_FAILURE':
      return {
        ...state,
        consecutiveFailures: state.consecutiveFailures + 1,
      }

    case 'OPEN_CIRCUIT':
      return {
        ...state,
        circuitState: CircuitState.OPEN,
        lastCircuitOpenTime: action.timestamp,
      }

    case 'SET_HALF_OPEN':
      return {
        ...state,
        circuitState: CircuitState.HALF_OPEN,
      }

    case 'RESET_CIRCUIT':
      return {
        ...state,
        circuitState: CircuitState.CLOSED,
        consecutiveFailures: 0,
      }

    case 'INCREMENT_REJECTED':
      return {
        ...state,
        rejectedRequests: state.rejectedRequests + 1,
        totalRequests: state.totalRequests + 1,
      }

    case 'INCREMENT_QUEUED':
      return {
        ...state,
        queuedRequests: state.queuedRequests + 1,
      }

    case 'INCREMENT_TIMEOUT':
      return {
        ...state,
        timeoutRequests: state.timeoutRequests + 1,
      }

    default:
      return state
  }
}

/**
 * Pure business logic functions
 */
const shouldOpenCircuit = (state: LimiterState, threshold: number): boolean => {
  return state.consecutiveFailures >= threshold
}

const shouldTransitionToHalfOpen = (state: LimiterState, resetMs: number): boolean => {
  if (state.circuitState !== CircuitState.OPEN) return false
  const now = Date.now()
  return now - state.lastCircuitOpenTime > resetMs
}

const isCircuitCurrentlyOpen = (state: LimiterState, resetMs: number): boolean => {
  if (state.circuitState === CircuitState.OPEN) {
    return !shouldTransitionToHalfOpen(state, resetMs)
  }
  return false
}

const canAcquireSlot = (state: LimiterState, maxConcurrency: number): boolean => {
  return state.activeRequests < maxConcurrency
}

const isQueueFull = (state: LimiterState, maxQueueSize: number): boolean => {
  return state.requestQueue.length >= maxQueueSize
}

/**
 * Concurrency limiting plugin with circuit breaker and queue management
 * Protects against overload with graceful degradation
 */
const concurrencyLimiterPlugin: CapabilityAwarePluginFactory = (
  context: PluginContext
): CapabilityAwarePlugin => {
  const config: ConcurrencyLimiterConfig = {
    enabled: true,
    maxConcurrency: 1000,
    maxQueueSize: 500,
    timeoutMs: 30000,
    circuitBreakerThreshold: 10,
    circuitBreakerResetMs: 60000,
    excludePaths: ['/health', '/metrics', '/drain'],
    ...(context.config as ConcurrencyLimiterConfig),
  }

  return async ({
    server,
    capabilities,
  }: {
    server: McpServer
    capabilities: CapabilityRegistry
  }) => {
    if (!config.enabled) {
      return
    }

    const { logger } = capabilities

    // Immutable state management
    let state = createInitialState()

    const dispatch = (action: LimiterAction): void => {
      const newState = limiterReducer(state, action)

      // Side effects based on state transitions
      if (state.circuitState !== newState.circuitState) {
        if (newState.circuitState === CircuitState.HALF_OPEN) {
          logger.info('Circuit breaker half-open', { plugin: context.manifest.name })
        } else if (
          newState.circuitState === CircuitState.CLOSED &&
          state.circuitState === CircuitState.HALF_OPEN
        ) {
          logger.info('Circuit breaker closed', { plugin: context.manifest.name })
        } else if (newState.circuitState === CircuitState.OPEN) {
          logger.warn('Circuit breaker opened', {
            plugin: context.manifest.name,
            consecutiveFailures: newState.consecutiveFailures,
            threshold: config.circuitBreakerThreshold,
          })
        }
      }

      state = newState
    }

    // Pure business logic functions with side effects separated
    const checkAndUpdateCircuitState = (): boolean => {
      if (shouldTransitionToHalfOpen(state, config.circuitBreakerResetMs!)) {
        dispatch({ type: 'SET_HALF_OPEN' })
        return false
      }
      return isCircuitCurrentlyOpen(state, config.circuitBreakerResetMs!)
    }

    const recordSuccess = (): void => {
      dispatch({ type: 'RECORD_SUCCESS' })
    }

    const recordFailure = (): void => {
      const timestamp = Date.now()
      dispatch({ type: 'RECORD_FAILURE', timestamp })

      if (shouldOpenCircuit(state, config.circuitBreakerThreshold!)) {
        dispatch({ type: 'OPEN_CIRCUIT', timestamp })
      }
    }

    // Request processing functions
    const _shouldBypassLimiting = (path: string): boolean => {
      return config.excludePaths?.some(excludePath => path.startsWith(excludePath)) || false
    }

    const processQueue = (): void => {
      while (state.requestQueue.length > 0 && canAcquireSlot(state, config.maxConcurrency!)) {
        const firstIndex = 0
        const entry = state.requestQueue[firstIndex]
        if (!entry) break

        dispatch({ type: 'REMOVE_FROM_QUEUE', index: firstIndex })
        dispatch({ type: 'ACQUIRE_SLOT' })
        entry.resolve(true)
      }
    }

    const _acquireSlot = async (_path: string): Promise<boolean> => {
      dispatch({ type: 'ACQUIRE_SLOT' })

      // Check circuit breaker
      if (checkAndUpdateCircuitState()) {
        dispatch({ type: 'INCREMENT_REJECTED' })
        throw new Error('Circuit breaker is open')
      }

      // Check if we can proceed immediately
      if (canAcquireSlot(state, config.maxConcurrency!)) {
        return true
      }

      // Check queue capacity
      if (isQueueFull(state, config.maxQueueSize!)) {
        dispatch({ type: 'INCREMENT_REJECTED' })
        throw new Error('Request queue full')
      }

      // Queue the request
      dispatch({ type: 'INCREMENT_QUEUED' })
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          dispatch({ type: 'INCREMENT_TIMEOUT' })
          // Remove from queue if still there
          const index = state.requestQueue.findIndex(entry => entry.resolve === resolve)
          if (index !== -1) {
            dispatch({ type: 'REMOVE_FROM_QUEUE', index })
          }
          reject(new Error('Request timeout in queue'))
        }, config.timeoutMs!)

        const entry = {
          resolve,
          reject,
          timestamp: Date.now(),
          timeout,
        }
        dispatch({ type: 'ADD_TO_QUEUE', entry })
      })
    }

    const releaseSlot = (): void => {
      dispatch({ type: 'RELEASE_SLOT' })
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
        inputSchema: {},
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
            dispatch({ type: 'RESET_CIRCUIT' })
            break

          case 'simulate_load':
            // Simulate concurrent requests
            for (let i = 0; i < count; i++) {
              if (canAcquireSlot(state, config.maxConcurrency!)) {
                dispatch({ type: 'ACQUIRE_SLOT' })
                // Simulate request completion after random delay
                setTimeout(() => {
                  releaseSlot()
                  recordSuccess()
                }, Math.random() * 1000)
              } else {
                dispatch({ type: 'INCREMENT_REJECTED' })
              }
            }
            break
        }

        return {
          content: [
            {
              type: 'text',
              text: `Action '${action}' executed. Current state: ${state.circuitState}, Active requests: ${state.activeRequests}, Consecutive failures: ${state.consecutiveFailures}`,
            },
          ],
        }
      }
    )

    // Register monitoring tool
    server.registerTool(
      'concurrency.status',
      {
        title: 'Concurrency Status',
        description: 'Get current concurrency limiter status and metrics',
        inputSchema: {},
      },
      async () => {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  active_requests: state.activeRequests,
                  queue_length: state.requestQueue.length,
                  circuit_state: state.circuitState,
                  consecutive_failures: state.consecutiveFailures,
                  config: {
                    max_concurrency: config.maxConcurrency,
                    max_queue_size: config.maxQueueSize,
                    timeout_ms: config.timeoutMs,
                    circuit_breaker_threshold: config.circuitBreakerThreshold,
                  },
                  metrics: {
                    total_requests: state.totalRequests,
                    rejected_requests: state.rejectedRequests,
                    queued_requests: state.queuedRequests,
                    timeout_requests: state.timeoutRequests,
                    rejection_rate:
                      state.totalRequests > 0
                        ? `${((state.rejectedRequests / state.totalRequests) * 100).toFixed(2)}%`
                        : '0%',
                  },
                },
                null,
                2
              ),
            },
          ],
        }
      }
    )

    logger.info('Concurrency limiter initialized', {
      plugin: context.manifest.name,
      maxConcurrency: config.maxConcurrency,
      maxQueueSize: config.maxQueueSize,
      timeoutMs: config.timeoutMs,
      circuitBreakerThreshold: config.circuitBreakerThreshold,
    })

    // Cleanup function - but CapabilityAwarePlugin should return void
    // Store cleanup for later use if needed
    const _cleanup = (): void => {
      // Clear any pending timeouts
      for (const entry of state.requestQueue) {
        clearTimeout(entry.timeout)
        entry.reject(new Error('Plugin shutting down'))
      }
      // Clear queue through state dispatch
      while (state.requestQueue.length > 0) {
        dispatch({ type: 'REMOVE_FROM_QUEUE', index: 0 })
      }
    }

    // TODO: Implement proper cleanup mechanism in plugin lifecycle
  }
}

export default concurrencyLimiterPlugin
