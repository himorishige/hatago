/**
 * Runner Manifest for MCP server declarations
 * Defines how to run MCP servers via npx and other package managers
 */

import { z } from 'zod'

/**
 * Package manager type
 */
export type PackageManager = 'npx' | 'npm' | 'pnpm' | 'yarn' | 'bun' | 'deno'

/**
 * Server transport configuration
 */
export const TransportConfigSchema = z.object({
  type: z.enum(['stdio', 'http']),
  url: z.string().url().optional(), // For HTTP transport
  port: z.number().optional(), // For HTTP transport
})

export type TransportConfig = z.infer<typeof TransportConfigSchema>

/**
 * Resource limits for process
 */
export const ResourceLimitsSchema = z.object({
  /** Maximum CPU time in seconds */
  cpuTime: z.number().optional(),

  /** Maximum memory in MB */
  memory: z.number().optional(),

  /** Maximum execution time in seconds */
  timeout: z.number().optional(),

  /** Maximum number of file descriptors */
  fileDescriptors: z.number().optional(),
})

export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>

/**
 * Permission configuration
 */
export const PermissionsSchema = z.object({
  /** Network access permission */
  network: z.boolean(),

  /** File system read permission */
  fsRead: z.boolean(),

  /** File system write permission */
  fsWrite: z.boolean(),

  /** Environment variable access */
  env: z.boolean(),

  /** Process spawn permission */
  spawn: z.boolean(),

  /** Allowed hosts for network access */
  allowedHosts: z.array(z.string()).optional(),

  /** Allowed paths for file system access */
  allowedPaths: z.array(z.string()).optional(),
})

export type Permissions = z.infer<typeof PermissionsSchema>

/**
 * MCP server manifest entry
 */
export const ServerManifestSchema = z.object({
  /** Unique identifier for the server */
  id: z.string(),

  /** Display name */
  name: z.string(),

  /** Description */
  description: z.string().optional(),

  /** NPM package name or command */
  package: z.string(),

  /** Package version (optional, latest by default) */
  version: z.string().optional(),

  /** Command to run (if different from package name) */
  command: z.string().optional(),

  /** Command line arguments */
  args: z.array(z.string()).optional(),

  /** Environment variables */
  env: z.record(z.string()).optional(),

  /** Working directory */
  cwd: z.string().optional(),

  /** Package manager to use */
  packageManager: z.enum(['npx', 'npm', 'pnpm', 'yarn', 'bun', 'deno']).default('npx'),

  /** Transport configuration */
  transport: TransportConfigSchema,

  /** Resource limits */
  limits: ResourceLimitsSchema.optional(),

  /** Permissions */
  permissions: PermissionsSchema.optional(),

  /** Auto-start on Hatago startup */
  autoStart: z.boolean().default(false),

  /** Restart on failure */
  restartOnFailure: z.boolean().default(true),

  /** Maximum restart attempts */
  maxRestarts: z.number().default(3),

  /** Health check configuration */
  healthCheck: z
    .object({
      enabled: z.boolean().default(true),
      interval: z.number().default(30000), // 30 seconds
      timeout: z.number().default(5000), // 5 seconds
    })
    .optional(),

  /** Dependencies to install before running */
  dependencies: z.array(z.string()).optional(),

  /** Tags for categorization */
  tags: z.array(z.string()).optional(),
})

export type ServerManifest = z.infer<typeof ServerManifestSchema>

/**
 * Runner configuration
 */
export const RunnerConfigSchema = z.object({
  /** List of server manifests */
  servers: z.array(ServerManifestSchema),

  /** Global defaults */
  defaults: z
    .object({
      packageManager: z.enum(['npx', 'npm', 'pnpm', 'yarn', 'bun', 'deno']).optional(),
      limits: ResourceLimitsSchema.optional(),
      permissions: PermissionsSchema.optional(),
    })
    .optional(),

  /** Registry URL for package installation */
  registry: z.string().url().optional(),

  /** Cache directory for installed packages */
  cacheDir: z.string().optional(),

  /** Log directory */
  logDir: z.string().optional(),
})

export type RunnerConfig = z.infer<typeof RunnerConfigSchema>

/**
 * Validate a server manifest
 */
export function validateManifest(manifest: unknown): ServerManifest {
  return ServerManifestSchema.parse(manifest)
}

/**
 * Validate runner configuration
 */
export function validateRunnerConfig(config: unknown): RunnerConfig {
  return RunnerConfigSchema.parse(config)
}

/**
 * Example manifests
 */
export const exampleManifests: ServerManifest[] = [
  {
    id: 'mcp-server-git',
    name: 'Git MCP Server',
    description: 'MCP server for Git operations',
    package: '@modelcontextprotocol/server-git',
    packageManager: 'npx',
    transport: {
      type: 'stdio',
    },
    permissions: {
      network: false,
      fsRead: true,
      fsWrite: true,
      env: false,
      spawn: true, // For git commands
    },
    autoStart: false,
    restartOnFailure: true,
    maxRestarts: 3,
    tags: ['git', 'vcs', 'development'],
  },
  {
    id: 'mcp-server-filesystem',
    name: 'Filesystem MCP Server',
    description: 'MCP server for filesystem operations',
    package: '@modelcontextprotocol/server-filesystem',
    packageManager: 'npx',
    transport: {
      type: 'stdio',
    },
    permissions: {
      network: false,
      fsRead: true,
      fsWrite: true,
      env: false,
      spawn: false,
      allowedPaths: ['~/Documents', '/tmp'],
    },
    limits: {
      memory: 512, // 512MB
      timeout: 300, // 5 minutes
    },
    autoStart: false,
    restartOnFailure: true,
    maxRestarts: 3,
    tags: ['filesystem', 'files', 'io'],
  },
  {
    id: 'weather-server',
    name: 'Weather MCP Server',
    description: 'MCP server for weather data',
    package: '@example/mcp-weather',
    packageManager: 'npx',
    version: '^1.0.0',
    transport: {
      type: 'http',
      port: 3001,
    },
    env: {
      WEATHER_API_KEY: '${WEATHER_API_KEY}', // Will be resolved from env
    },
    permissions: {
      network: true,
      fsRead: false,
      fsWrite: false,
      env: true,
      spawn: false,
      allowedHosts: ['api.weather.com', 'api.openweathermap.org'],
    },
    healthCheck: {
      enabled: true,
      interval: 60000, // 1 minute
      timeout: 10000, // 10 seconds
    },
    autoStart: true,
    restartOnFailure: true,
    maxRestarts: 3,
    tags: ['weather', 'api', 'data'],
  },
]

/**
 * Build command for package manager
 */
export function buildCommand(
  manifest: ServerManifest,
  options?: {
    useCache?: boolean
    registry?: string
  }
): string[] {
  const pm = manifest.packageManager
  const pkg = manifest.package
  const version = manifest.version || 'latest'
  const command = manifest.command || pkg

  switch (pm) {
    case 'npx': {
      const npxArgs = []
      if (!options?.useCache) {
        npxArgs.push('--no')
      }
      if (options?.registry) {
        npxArgs.push('--registry', options.registry)
      }
      if (version !== 'latest') {
        npxArgs.push(`${pkg}@${version}`)
      } else {
        npxArgs.push(pkg)
      }
      if (command !== pkg) {
        npxArgs.push(command)
      }
      if (manifest.args) {
        npxArgs.push(...manifest.args)
      }
      return ['npx', ...npxArgs]
    }

    case 'pnpm':
      return ['pnpm', 'dlx', `${pkg}@${version}`, ...(manifest.args || [])]

    case 'yarn':
      return ['yarn', 'dlx', `${pkg}@${version}`, ...(manifest.args || [])]

    case 'bun':
      return ['bunx', `${pkg}@${version}`, ...(manifest.args || [])]

    case 'deno':
      return ['deno', 'run', '--allow-all', `npm:${pkg}@${version}`, ...(manifest.args || [])]
    default:
      return ['npm', 'exec', '--', `${pkg}@${version}`, ...(manifest.args || [])]
  }
}
