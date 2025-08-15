import type { CapabilityAwarePluginFactory, PluginContext } from '@hatago/core'

export interface RateLimitConfig {
  /** Global rate limit (requests per window) */
  globalLimit?: number
  /** Time window in seconds */
  window?: number
  /** Per-endpoint specific limits */
  endpoints?: Record<
    string,
    {
      limit: number
      window?: number
    }
  >
}

interface TokenBucket {
  tokens: number
  lastRefill: number
  capacity: number
  refillRate: number
}

/**
 * Rate limiting plugin using token bucket algorithm
 * Simple implementation focusing on tool-level rate limiting
 */
const rateLimitPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  const config: RateLimitConfig = {
    globalLimit: 100,
    window: 60,
    ...(context.config as RateLimitConfig),
  }

  return async ({ server, capabilities }) => {
    const { logger, timer } = capabilities

    // In-memory token bucket storage
    const buckets = new Map<string, TokenBucket>()

    // Rate limiting utility
    function createRateLimiter(limit: number, window: number) {
      return async (key: string): Promise<boolean> => {
        const now = Date.now()
        let bucket = buckets.get(key)

        if (!bucket) {
          bucket = {
            tokens: limit,
            lastRefill: now,
            capacity: limit,
            refillRate: limit / window, // tokens per second
          }
          buckets.set(key, bucket)
        }

        // Refill tokens based on time elapsed
        const timePassed = (now - bucket.lastRefill) / 1000 // seconds
        const tokensToAdd = timePassed * bucket.refillRate
        bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd)
        bucket.lastRefill = now

        // Check if we have tokens available
        if (bucket.tokens >= 1) {
          bucket.tokens -= 1
          return true
        }

        return false
      }
    }

    // Create global rate limiter
    const globalRateLimit = createRateLimiter(config.globalLimit || 100, config.window || 60)

    // Register rate limit testing tool
    server.registerTool(
      'rate-limit.check',
      {
        title: 'Check Rate Limit',
        description: 'Test rate limiting functionality',
        inputSchema: {},
      },
      async (args: any) => {
        const { key = 'test' } = args
        const allowed = await globalRateLimit(key)

        if (!allowed) {
          logger.warn('Rate limit exceeded for test', { key })
          throw new Error('Rate limit exceeded')
        }

        logger.info('Rate limit check passed', { key })
        return {
          content: [
            {
              type: 'text',
              text: `Rate limit check passed for key: ${key}`,
            },
          ],
        }
      }
    )

    // Cleanup expired buckets periodically
    let cleanupInterval: number | undefined
    if (timer) {
      cleanupInterval = timer.setInterval(
        () => {
          const now = Date.now()
          const expired: string[] = []

          for (const [key, bucket] of buckets.entries()) {
            // Remove buckets that haven't been used for 2x the window
            if (now - bucket.lastRefill > (config.window || 60) * 2000) {
              expired.push(key)
            }
          }

          for (const key of expired) {
            buckets.delete(key)
          }

          if (expired.length > 0) {
            logger.debug('Cleaned up expired rate limit buckets', { count: expired.length })
          }
        },
        (config.window || 60) * 1000
      )
    }

    logger.info('Rate limiting plugin initialized', {
      globalLimit: config.globalLimit,
      window: config.window,
      endpoints: Object.keys(config.endpoints || {}),
    })
  }
}

export default rateLimitPlugin
