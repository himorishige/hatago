/**
 * Tests for Runner Manifest
 */

import { describe, expect, it } from 'vitest'
import {
  type ServerManifest,
  buildCommand,
  validateManifest,
  validateRunnerConfig,
} from './manifest.js'

describe('Runner Manifest', () => {
  describe('validateManifest', () => {
    it('should validate a valid manifest', () => {
      const manifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/mcp-server',
        packageManager: 'npx',
        transport: {
          type: 'stdio',
        },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      expect(() => validateManifest(manifest)).not.toThrow()
    })

    it('should reject manifest without required fields', () => {
      const manifest = {
        id: 'test-server',
        name: 'Test Server',
        // Missing package and packageManager
        transport: {
          type: 'stdio',
        },
      }

      expect(() => validateManifest(manifest)).toThrow()
    })

    it('should validate manifest with permissions', () => {
      const manifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/mcp-server',
        packageManager: 'npx',
        transport: {
          type: 'stdio',
        },
        permissions: {
          network: true,
          fsRead: true,
          fsWrite: false,
          env: true,
          spawn: false,
          allowedHosts: ['api.example.com'],
        },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const validated = validateManifest(manifest)
      expect(validated.permissions).toBeDefined()
      expect(validated.permissions?.network).toBe(true)
      expect(validated.permissions?.allowedHosts).toEqual(['api.example.com'])
    })

    it('should validate manifest with HTTP transport', () => {
      const manifest = {
        id: 'http-server',
        name: 'HTTP Server',
        package: '@test/http-server',
        packageManager: 'npx',
        transport: {
          type: 'http',
          port: 3000,
        },
        autoStart: true,
        restartOnFailure: true,
        maxRestarts: 5,
      }

      const validated = validateManifest(manifest)
      expect(validated.transport.type).toBe('http')
      expect((validated.transport as any).port).toBe(3000)
    })
  })

  describe('buildCommand', () => {
    it('should build npx command', () => {
      const manifest: ServerManifest = {
        id: 'test',
        name: 'Test',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = buildCommand(manifest)
      expect(command).toEqual(['npx', '--no', '@test/server'])
    })

    it('should build npx command with version', () => {
      const manifest: ServerManifest = {
        id: 'test',
        name: 'Test',
        package: '@test/server',
        version: '^1.2.0',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = buildCommand(manifest)
      expect(command).toEqual(['npx', '--no', '@test/server@^1.2.0'])
    })

    it('should build npx command with args', () => {
      const manifest: ServerManifest = {
        id: 'test',
        name: 'Test',
        package: '@test/server',
        packageManager: 'npx',
        args: ['--port', '3000'],
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = buildCommand(manifest)
      expect(command).toEqual(['npx', '--no', '@test/server', '--port', '3000'])
    })

    it('should build pnpm command', () => {
      const manifest: ServerManifest = {
        id: 'test',
        name: 'Test',
        package: '@test/server',
        packageManager: 'pnpm',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = buildCommand(manifest)
      expect(command).toEqual(['pnpm', 'dlx', '@test/server@latest'])
    })

    it('should build yarn command', () => {
      const manifest: ServerManifest = {
        id: 'test',
        name: 'Test',
        package: '@test/server',
        version: '2.0.0',
        packageManager: 'yarn',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = buildCommand(manifest)
      expect(command).toEqual(['yarn', 'dlx', '@test/server@2.0.0'])
    })

    it('should build bun command', () => {
      const manifest: ServerManifest = {
        id: 'test',
        name: 'Test',
        package: '@test/server',
        packageManager: 'bun',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = buildCommand(manifest)
      expect(command).toEqual(['bunx', '@test/server@latest'])
    })

    it('should build deno command', () => {
      const manifest: ServerManifest = {
        id: 'test',
        name: 'Test',
        package: '@test/server',
        packageManager: 'deno',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = buildCommand(manifest)
      expect(command).toEqual(['deno', 'run', '--allow-all', 'npm:@test/server@latest'])
    })

    it('should use registry option', () => {
      const manifest: ServerManifest = {
        id: 'test',
        name: 'Test',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = buildCommand(manifest, {
        registry: 'https://custom.registry.com',
      })
      expect(command).toEqual([
        'npx',
        '--no',
        '--registry',
        'https://custom.registry.com',
        '@test/server',
      ])
    })
  })

  describe('validateRunnerConfig', () => {
    it('should validate runner config with servers', () => {
      const config = {
        servers: [
          {
            id: 'test-server',
            name: 'Test Server',
            package: '@test/mcp-server',
            packageManager: 'npx',
            transport: {
              type: 'stdio',
            },
            autoStart: false,
            restartOnFailure: true,
            maxRestarts: 3,
          },
        ],
      }

      const validated = validateRunnerConfig(config)
      expect(validated.servers).toHaveLength(1)
      expect(validated.servers[0]?.id).toBe('test-server')
    })

    it('should validate runner config with defaults', () => {
      const config = {
        servers: [],
        defaults: {
          packageManager: 'pnpm',
          limits: {
            memory: 512,
            timeout: 300,
          },
          permissions: {
            network: false,
            fsRead: true,
            fsWrite: false,
            env: false,
            spawn: false,
          },
        },
        registry: 'https://registry.npmjs.org',
        cacheDir: '/tmp/mcp-cache',
      }

      const validated = validateRunnerConfig(config)
      expect(validated.defaults?.packageManager).toBe('pnpm')
      expect(validated.defaults?.limits?.memory).toBe(512)
      expect(validated.registry).toBe('https://registry.npmjs.org')
    })
  })
})
