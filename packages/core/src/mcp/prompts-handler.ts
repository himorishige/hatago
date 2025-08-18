/**
 * Prompts handler for MCP servers
 * Implements prompts/list, prompts/get and list_changed notifications
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createDefaultLogger } from '../logger/index.js'

const logger = createDefaultLogger('prompts-handler')

/**
 * Prompt definition
 */
export interface PromptDefinition {
  name: string
  title?: string
  description?: string
  argsSchema?: z.ZodSchema<any>
  handler: (args: any) => {
    messages: Array<{
      role: 'user' | 'assistant' | 'system'
      content: {
        type: 'text'
        text: string
      }
    }>
  }
}

/**
 * Prompts registry for managing prompts
 */
export class PromptsRegistry {
  private prompts = new Map<string, PromptDefinition>()
  private server: McpServer | null = null

  /**
   * Set the MCP server for notifications
   */
  setServer(server: McpServer): void {
    this.server = server
  }

  /**
   * Register a new prompt
   */
  register(prompt: PromptDefinition): void {
    const existing = this.prompts.has(prompt.name)
    this.prompts.set(prompt.name, prompt)

    logger.info('Prompt registered', {
      name: prompt.name,
      title: prompt.title,
      updated: existing,
    })

    // Emit list_changed notification
    if (this.server) {
      this.notifyListChanged()
    }
  }

  /**
   * Unregister a prompt
   */
  unregister(name: string): boolean {
    const deleted = this.prompts.delete(name)

    if (deleted) {
      logger.info('Prompt unregistered', { name })

      // Emit list_changed notification
      if (this.server) {
        this.notifyListChanged()
      }
    }

    return deleted
  }

  /**
   * Get a prompt by name
   */
  get(name: string): PromptDefinition | undefined {
    return this.prompts.get(name)
  }

  /**
   * List all prompts
   */
  list(): PromptDefinition[] {
    return Array.from(this.prompts.values())
  }

  /**
   * Clear all prompts
   */
  clear(): void {
    const hadPrompts = this.prompts.size > 0
    this.prompts.clear()

    if (hadPrompts && this.server) {
      this.notifyListChanged()
    }
  }

  /**
   * Notify clients about prompt list changes
   */
  private notifyListChanged(): void {
    // This would typically emit a notification through the transport
    // The actual implementation depends on the transport layer
    logger.debug('Prompts list changed notification', {
      count: this.prompts.size,
    })
  }
}

/**
 * Create prompts handlers for MCP server
 */
export function createPromptsHandlers(
  server: McpServer,
  registry: PromptsRegistry
): { registerPrompt: (prompt: PromptDefinition) => void } {
  // Set server for notifications
  registry.setServer(server)

  // Register prompt with the MCP server's built-in method
  const registerPrompt = (prompt: PromptDefinition) => {
    const argsSchema = prompt.argsSchema as any
    const options: any = {}
    if (prompt.title) options.title = prompt.title
    if (prompt.description) options.description = prompt.description
    if (argsSchema) options.argsSchema = argsSchema

    server.registerPrompt(prompt.name, options, prompt.handler as any)

    // Also track in our registry for management
    registry.register(prompt)
  }

  // Export for use in plugins
  return { registerPrompt }
}

/**
 * Example prompt definitions
 */
export const examplePrompts: PromptDefinition[] = [
  {
    name: 'code-review',
    title: 'Code Review',
    description: 'Review code for best practices and potential issues',
    argsSchema: z.object({
      code: z.string(),
      language: z.string().optional(),
      focus: z.enum(['security', 'performance', 'readability', 'all']).optional(),
    }),
    handler: ({ code, language, focus }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please review this ${language || 'code'} with focus on ${focus || 'all aspects'}:\n\n${code}`,
          },
        },
      ],
    }),
  },
  {
    name: 'explain-error',
    title: 'Explain Error',
    description: 'Explain an error message and suggest solutions',
    argsSchema: z.object({
      error: z.string(),
      context: z.string().optional(),
    }),
    handler: ({ error, context }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please explain this error and suggest solutions:\n\nError: ${error}${
              context ? `\n\nContext: ${context}` : ''
            }`,
          },
        },
      ],
    }),
  },
  {
    name: 'generate-test',
    title: 'Generate Test',
    description: 'Generate unit tests for code',
    argsSchema: z.object({
      code: z.string(),
      framework: z.enum(['jest', 'vitest', 'mocha', 'pytest', 'unittest']).optional(),
      coverage: z.enum(['basic', 'comprehensive', 'edge-cases']).optional(),
    }),
    handler: ({ code, framework, coverage }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate ${coverage || 'comprehensive'} unit tests for this code using ${
              framework || 'appropriate framework'
            }:\n\n${code}`,
          },
        },
      ],
    }),
  },
]
