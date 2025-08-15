import type { HatagoPlugin, HatagoPluginFactory } from '../types.js'

export interface HealthEndpointsConfig {
  /** Enable health endpoints */
  enabled?: boolean
  /** Additional health checks */
  checks?: Array<{
    name: string
    check: () => Promise<{ status: 'pass' | 'fail'; details?: any }>
  }>
  /** Startup checks (dependencies that must be ready before accepting traffic) */
  startupChecks?: Array<{
    name: string
    check: () => Promise<{ status: 'pass' | 'fail'; details?: any }>
  }>
}

/**
 * Health endpoints plugin - provides Kubernetes-style health endpoints
 * /health/live - Liveness probe (process is alive)
 * /health/ready - Readiness probe (ready to serve traffic)
 * /health/startup - Startup probe (initialization complete)
 */
export const healthEndpoints: HatagoPluginFactory<HealthEndpointsConfig> =
  (config: HealthEndpointsConfig = {}): HatagoPlugin =>
  ({ app }) => {
    if (config.enabled === false) {
      return
    }

    let startupComplete = false
    let draining = false

    // Initialize startup checks
    const initializeStartup = async () => {
      if (config.startupChecks?.length) {
        for (const check of config.startupChecks) {
          try {
            const result = await check.check()
            if (result.status === 'fail') {
              console.warn(`Startup check '${check.name}' failed:`, result.details)
              return false
            }
          } catch (error) {
            console.error(`Startup check '${check.name}' error:`, error)
            return false
          }
        }
      }
      return true
    }

    // Run startup checks asynchronously
    initializeStartup().then(success => {
      if (success) {
        startupComplete = true
        console.log('✅ Startup checks completed successfully')
      } else {
        console.error('❌ Startup checks failed')
      }
    })

    // /health/live - Liveness probe (no dependencies, just process health)
    app.get('/health/live', c => {
      if (draining) {
        return c.json(
          {
            status: 'fail',
            timestamp: new Date().toISOString(),
            reason: 'draining',
          },
          503
        )
      }

      return c.json({
        status: 'pass',
        timestamp: new Date().toISOString(),
        checks: {
          process: {
            status: 'pass',
            details: {
              pid: process.pid,
              uptime: process.uptime?.() || 0,
              platform: process.platform,
              version: process.version,
            },
          },
        },
      })
    })

    // /health/ready - Readiness probe (dependencies and readiness)
    app.get('/health/ready', async c => {
      const correlationId = c.req.header('x-correlation-id') || crypto.randomUUID()

      if (draining) {
        return c.json(
          {
            status: 'fail',
            timestamp: new Date().toISOString(),
            correlationId,
            reason: 'draining',
          },
          503
        )
      }

      if (!startupComplete) {
        return c.json(
          {
            status: 'fail',
            timestamp: new Date().toISOString(),
            correlationId,
            reason: 'startup_incomplete',
          },
          503
        )
      }

      try {
        const checks: Record<string, any> = {}
        let overallStatus: 'pass' | 'fail' = 'pass'

        // Run configured readiness checks
        if (config.checks?.length) {
          for (const healthCheck of config.checks) {
            try {
              const result = await healthCheck.check()
              checks[healthCheck.name] = result
              if (result.status === 'fail') {
                overallStatus = 'fail'
              }
            } catch (error) {
              checks[healthCheck.name] = {
                status: 'fail',
                details: { error: error instanceof Error ? error.message : 'Unknown error' },
              }
              overallStatus = 'fail'
            }
          }
        }

        // Add basic system checks
        const memUsage = process.memoryUsage?.()
        checks.memory = {
          status: 'pass',
          details: memUsage || { rss: 0, heapUsed: 0, heapTotal: 0 },
        }

        // Check memory pressure (warn if heap > 80% of total)
        if (memUsage && memUsage.heapUsed > memUsage.heapTotal * 0.8) {
          checks.memory.status = 'warn'
          checks.memory.details.warning = 'High memory usage'
        }

        const status = overallStatus === 'pass' ? 200 : 503

        return c.json(
          {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            correlationId,
            checks,
          },
          status
        )
      } catch (error) {
        return c.json(
          {
            status: 'fail',
            timestamp: new Date().toISOString(),
            correlationId,
            error: error instanceof Error ? error.message : 'Health check failed',
          },
          503
        )
      }
    })

    // /health/startup - Startup probe (initialization complete)
    app.get('/health/startup', c => {
      const correlationId = c.req.header('x-correlation-id') || crypto.randomUUID()

      if (!startupComplete) {
        return c.json(
          {
            status: 'fail',
            timestamp: new Date().toISOString(),
            correlationId,
            reason: 'initialization_in_progress',
          },
          503
        )
      }

      return c.json({
        status: 'pass',
        timestamp: new Date().toISOString(),
        correlationId,
        checks: {
          startup: {
            status: 'pass',
            details: {
              initialized: true,
              startup_checks_passed: config.startupChecks?.length || 0,
            },
          },
        },
      })
    })

    // Legacy endpoints for backward compatibility
    app.get('/healthz', c => c.redirect('/health/live'))
    app.get('/readyz', c => c.redirect('/health/ready'))

    // Drain endpoint for graceful shutdown
    app.post('/drain', c => {
      draining = true
      return c.json({
        status: 'draining',
        timestamp: new Date().toISOString(),
        message: 'Server is draining, will stop accepting new requests',
      })
    })

    // Store state management functions globally if needed by other plugins
    // These can be accessed through module scope if required
  }

export default healthEndpoints
