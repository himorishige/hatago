/**
 * Completion handler for MCP servers
 * Implements argument and URI completion for better UX
 */

import { completable } from '@modelcontextprotocol/sdk/server/completable.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createDefaultLogger } from '../logger/index.js'

const logger = createDefaultLogger('completion-handler')

/**
 * Completion provider function type
 */
export type CompletionProvider = (
  value: string,
  context?: {
    arguments?: Record<string, unknown>
  }
) => string[] | Promise<string[]>

/**
 * Completion configuration for an argument
 */
export interface CompletionConfig {
  /** The argument name */
  name: string

  /** Completion provider function */
  provider: CompletionProvider

  /** Whether completions are context-aware */
  contextAware?: boolean

  /** Description of what completions provide */
  description?: string
}

/**
 * Registry for managing completions
 */
export class CompletionRegistry {
  private completions = new Map<string, Map<string, Map<string, CompletionConfig>>>()

  /**
   * Register completion for a tool/prompt argument
   */
  registerCompletion(
    targetType: 'tool' | 'prompt' | 'resource',
    targetName: string,
    config: CompletionConfig
  ): void {
    if (!this.completions.has(targetType)) {
      this.completions.set(targetType, new Map())
    }

    const typeCompletions = this.completions.get(targetType)
    if (!typeCompletions) {
      throw new Error(`No completions for type: ${targetType}`)
    }
    if (!typeCompletions.has(targetName)) {
      typeCompletions.set(targetName, new Map())
    }

    const targetCompletions = typeCompletions.get(targetName)
    if (targetCompletions) {
      targetCompletions.set(config.name, config)
    }

    logger.debug('Completion registered', {
      type: targetType,
      target: targetName,
      argument: config.name,
      contextAware: config.contextAware,
    })
  }

  /**
   * Get completions for a specific argument
   */
  async getCompletions(
    targetType: 'tool' | 'prompt' | 'resource',
    targetName: string,
    argumentName: string,
    value: string,
    context?: { arguments?: Record<string, unknown> }
  ): Promise<string[]> {
    const typeCompletions = this.completions.get(targetType)
    if (!typeCompletions) return []

    const targetCompletions = typeCompletions.get(targetName)
    if (!targetCompletions) return []

    const config = targetCompletions.get(argumentName)
    if (!config) return []

    try {
      const completions = await config.provider(value, context)

      logger.debug('Completions generated', {
        type: targetType,
        target: targetName,
        argument: argumentName,
        value,
        count: completions.length,
      })

      return completions
    } catch (error) {
      logger.error('Completion provider error', {
        type: targetType,
        target: targetName,
        argument: argumentName,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }
}

/**
 * Create completable schema with provider
 */
export function createCompletableSchema<T extends z.ZodType>(
  schema: T,
  provider: CompletionProvider
) {
  return completable(schema, provider)
}

/**
 * Example completion providers
 */
export const commonCompletions = {
  /**
   * File path completion
   */
  filePath: (_basePath = '.'): CompletionProvider => {
    return async (value: string) => {
      // This would typically use fs to list files
      // For now, return example paths
      const paths = ['src/index.ts', 'src/app.ts', 'package.json', 'README.md', 'tsconfig.json']

      return paths.filter(p => p.startsWith(value))
    }
  },

  /**
   * Programming language completion
   */
  language: (): CompletionProvider => {
    const languages = [
      'javascript',
      'typescript',
      'python',
      'rust',
      'go',
      'java',
      'csharp',
      'cpp',
      'ruby',
      'swift',
    ]

    return (value: string) => {
      return languages.filter(l => l.startsWith(value.toLowerCase()))
    }
  },

  /**
   * URL scheme completion
   */
  urlScheme: (): CompletionProvider => {
    const schemes = ['http://', 'https://', 'ftp://', 'file://', 'ws://', 'wss://', 'mcp://']

    return (value: string) => {
      return schemes.filter(s => s.startsWith(value.toLowerCase()))
    }
  },

  /**
   * Context-aware team member completion
   */
  teamMember: (): CompletionProvider => {
    const teams = {
      engineering: ['Alice', 'Bob', 'Charlie', 'David'],
      design: ['Eve', 'Frank', 'Grace'],
      marketing: ['Henry', 'Iris', 'Jack'],
      sales: ['Kate', 'Liam', 'Maya'],
    }

    return (value: string, context) => {
      const department = context?.arguments?.department as string

      if (department && teams[department as keyof typeof teams]) {
        return teams[department as keyof typeof teams].filter(name =>
          name.toLowerCase().startsWith(value.toLowerCase())
        )
      }

      // Return all names if no department specified
      return Object.values(teams)
        .flat()
        .filter(name => name.toLowerCase().startsWith(value.toLowerCase()))
    }
  },

  /**
   * Dynamic enum completion
   */
  enumValues: (values: string[]): CompletionProvider => {
    return (value: string) => {
      return values.filter(v => v.toLowerCase().startsWith(value.toLowerCase()))
    }
  },
}

/**
 * Create completion handlers for MCP server
 */
export function setupCompletionHandlers(server: McpServer, _registry: CompletionRegistry): void {
  // The actual completion handling would be integrated with the transport layer
  // This is a placeholder for the completion request handler

  logger.info('Completion handlers setup', {
    server: (server as McpServer & { name?: string }).name || 'unknown',
  })
}

/**
 * Example: Register completions for a tool
 */
export function registerToolWithCompletions(server: McpServer, registry: CompletionRegistry) {
  // Example tool with completions
  server.registerTool(
    'file-operation',
    {
      title: 'File Operation',
      description: 'Perform operations on files',
      inputSchema: {
        action: createCompletableSchema(
          z.enum(['read', 'write', 'delete', 'copy', 'move']),
          commonCompletions.enumValues(['read', 'write', 'delete', 'copy', 'move'])
        ),
        path: createCompletableSchema(z.string(), commonCompletions.filePath()),
        content: z.string().optional(),
      },
    },
    async ({ action, path }) => {
      // Tool implementation
      return {
        content: [
          {
            type: 'text',
            text: `Performed ${action} on ${path}`,
          },
        ],
      }
    }
  )

  // Register completions in registry
  registry.registerCompletion('tool', 'file-operation', {
    name: 'action',
    provider: commonCompletions.enumValues(['read', 'write', 'delete', 'copy', 'move']),
    description: 'File operation actions',
  })

  registry.registerCompletion('tool', 'file-operation', {
    name: 'path',
    provider: commonCompletions.filePath(),
    description: 'File system paths',
  })
}
