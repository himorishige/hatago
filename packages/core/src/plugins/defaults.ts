import type { HatagoPlugin } from '../types.js'
import { helloHatago } from './hello-hatago.js'
import { oauthMetadata } from './oauth-metadata.js'
import { healthEndpoints } from './health-endpoints.js'
import { sloMetrics } from './slo-metrics.js'
import { structuredLogging, LogLevel } from './structured-logging.js'
import { pluginSecurity } from './plugin-security.js'

/**
 * Create default plugins with environment-based configuration
 */
export function createDefaultPlugins(env: Record<string, unknown> = {}): HatagoPlugin[] {
  // Environment variables with defaults
  const REQUIRE_AUTH = env.REQUIRE_AUTH === 'true'
  const AUTH_ISSUER = (env.AUTH_ISSUER as string) || 'https://accounts.example.com'
  const RESOURCE = env.RESOURCE as string | undefined
  const PLUGIN_SECURITY_ENABLED = env.PLUGIN_SECURITY_ENABLED !== 'false'
  const REQUIRE_SIGNED_PLUGINS = env.REQUIRE_SIGNED_PLUGINS === 'true'

  return [
    // Structured logging (must be first for proper initialization)
    structuredLogging({
      enabled: true,
      level: env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
      format: env.NODE_ENV === 'production' ? 'json' : 'compact',
      includeStackTrace: env.NODE_ENV !== 'production'
    }),

    // Plugin security and signature verification
    pluginSecurity({
      enabled: PLUGIN_SECURITY_ENABLED,
      requireSigned: REQUIRE_SIGNED_PLUGINS,
      allowTestKeys: env.NODE_ENV !== 'production',
      maxSignatureAgeHours: 24,
      blockUnsigned: REQUIRE_SIGNED_PLUGINS
    }),

    // Stream "Hello Hatago" demo tool
    helloHatago(),

    // Health endpoints for monitoring
    healthEndpoints({ enabled: true }),

    // SLO-compliant metrics collection
    sloMetrics({ 
      enabled: true,
      sloTargets: {
        availability: 99.95,
        p95LatencyMs: 5,
        p99LatencyMs: 10,
        errorRatePercent: 0.1
      }
    }),

    // OAuth Protected Resource Metadata (RFC 9728)
    oauthMetadata({
      issuer: AUTH_ISSUER,
      ...(RESOURCE && { resource: RESOURCE }),
      requireAuth: REQUIRE_AUTH,
    }),
  ]
}
