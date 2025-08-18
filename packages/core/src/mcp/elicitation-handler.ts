/**
 * Elicitation handler for MCP servers
 * Implements user input requests during tool execution
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createDefaultLogger } from '../logger/index.js'

const logger = createDefaultLogger('elicitation-handler')

/**
 * Elicitation request for user input
 */
export interface ElicitationRequest {
  /** Message to display to user */
  message: string

  /** JSON Schema for the requested input */
  requestedSchema: {
    type: 'object' | 'string' | 'number' | 'boolean' | 'array'
    properties?: Record<string, any>
    required?: string[]
    title?: string
    description?: string
    enum?: any[]
    enumNames?: string[]
  }

  /** Request ID for tracking */
  requestId?: string

  /** Timeout in milliseconds */
  timeout?: number
}

/**
 * Elicitation response from user
 */
export interface ElicitationResponse {
  /** User action */
  action: 'accept' | 'decline' | 'cancel'

  /** User provided content (if accepted) */
  content?: Record<string, any> | string | number | boolean

  /** Reason for decline/cancel */
  reason?: string
}

/**
 * Elicitation handler interface
 */
export interface ElicitationHandler {
  /** Request user input */
  elicit(request: ElicitationRequest): Promise<ElicitationResponse>
}

/**
 * CLI elicitation handler using readline
 */
export class CLIElicitationHandler implements ElicitationHandler {
  async elicit(request: ElicitationRequest): Promise<ElicitationResponse> {
    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise(resolve => {
      console.log('\n=== User Input Required ===')
      console.log(request.message)

      if (request.requestedSchema.description) {
        console.log(`Description: ${request.requestedSchema.description}`)
      }

      // Simple implementation for different types
      const promptForInput = () => {
        switch (request.requestedSchema.type) {
          case 'boolean':
            rl.question('Enter yes/no (y/n): ', answer => {
              rl.close()
              const accepted = answer.toLowerCase().startsWith('y')
              resolve({
                action: accepted ? 'accept' : 'decline',
                content: accepted,
              })
            })
            break

          case 'string':
            if (request.requestedSchema.enum) {
              console.log('Options:', request.requestedSchema.enum.join(', '))
            }
            rl.question('Enter value (or press Enter to cancel): ', answer => {
              rl.close()
              if (answer.trim() === '') {
                resolve({ action: 'cancel' })
              } else {
                resolve({
                  action: 'accept',
                  content: answer,
                })
              }
            })
            break

          case 'object': {
            // For objects, we'd need a more complex UI
            // This is a simplified version
            const props = request.requestedSchema.properties || {}
            const result: Record<string, any> = {}
            const propKeys = Object.keys(props)
            let index = 0

            const askNext = () => {
              if (index >= propKeys.length) {
                rl.close()
                resolve({
                  action: 'accept',
                  content: result,
                })
                return
              }

              const key = propKeys[index]
              if (!key) {
                rl.close()
                resolve({
                  action: 'accept',
                  content: result,
                })
                return
              }
              const prop = props[key]
              rl.question(`${key} (${prop.type}): `, answer => {
                if (answer.trim() === '' && request.requestedSchema.required?.includes(key)) {
                  console.log(`${key} is required`)
                  askNext() // Ask again
                } else if (answer.trim() !== '') {
                  result[key] = answer
                  index++
                  askNext()
                } else {
                  index++
                  askNext()
                }
              })
            }

            askNext()
            break
          }

          default:
            rl.question('Enter value: ', answer => {
              rl.close()
              resolve({
                action: 'accept',
                content: answer,
              })
            })
        }
      }

      promptForInput()
    })
  }
}

/**
 * Web UI elicitation handler
 */
export class WebUIElicitationHandler implements ElicitationHandler {
  constructor(private sendToUI: (request: ElicitationRequest) => Promise<ElicitationResponse>) {}

  async elicit(request: ElicitationRequest): Promise<ElicitationResponse> {
    return this.sendToUI(request)
  }
}

/**
 * Mock elicitation handler for testing
 */
export class MockElicitationHandler implements ElicitationHandler {
  constructor(private responses: ElicitationResponse[] = []) {}

  async elicit(_request: ElicitationRequest): Promise<ElicitationResponse> {
    const response = this.responses.shift()
    if (!response) {
      return { action: 'cancel', reason: 'No mock response available' }
    }
    return response
  }

  addResponse(response: ElicitationResponse): void {
    this.responses.push(response)
  }
}

/**
 * Elicitation manager for handling requests
 */
export class ElicitationManager {
  private handler: ElicitationHandler
  private pendingRequests = new Map<string, ElicitationRequest>()

  constructor(handler: ElicitationHandler) {
    this.handler = handler
  }

  /**
   * Set the elicitation handler
   */
  setHandler(handler: ElicitationHandler): void {
    this.handler = handler
  }

  /**
   * Request user input
   */
  async requestInput(request: ElicitationRequest): Promise<ElicitationResponse> {
    const requestId = request.requestId || Math.random().toString(36).substr(2, 9)

    logger.info('Elicitation request', {
      requestId,
      message: request.message,
      schemaType: request.requestedSchema.type,
    })

    this.pendingRequests.set(requestId, request)

    try {
      // Apply timeout if specified
      if (request.timeout) {
        const timeoutPromise = new Promise<ElicitationResponse>(resolve => {
          setTimeout(() => {
            resolve({
              action: 'cancel',
              reason: 'Request timed out',
            })
          }, request.timeout)
        })

        const response = await Promise.race([this.handler.elicit(request), timeoutPromise])

        this.pendingRequests.delete(requestId)

        logger.info('Elicitation response', {
          requestId,
          action: response.action,
        })

        return response
      }
        const response = await this.handler.elicit(request)
        this.pendingRequests.delete(requestId)

        logger.info('Elicitation response', {
          requestId,
          action: response.action,
        })

        return response
    } catch (error) {
      this.pendingRequests.delete(requestId)

      logger.error('Elicitation error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        action: 'cancel',
        reason: 'Elicitation failed',
      }
    }
  }

  /**
   * Cancel a pending request
   */
  cancelRequest(requestId: string): boolean {
    return this.pendingRequests.delete(requestId)
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): ElicitationRequest[] {
    return Array.from(this.pendingRequests.values())
  }
}

/**
 * Setup elicitation for MCP server
 */
export function setupElicitation(
  server: McpServer,
  handler: ElicitationHandler
): ElicitationManager {
  const manager = new ElicitationManager(handler)

  // Make elicitation available to tools through the server context
  // This would typically be integrated with the MCP server's request handling

  logger.info('Elicitation setup complete', {
    server: (server as any).name || 'unknown',
    handlerType: handler.constructor.name,
  })

  return manager
}

/**
 * Example: Tool with elicitation
 */
export async function exampleToolWithElicitation(
  manager: ElicitationManager,
  initialData: { restaurant: string; date: string; partySize: number }
) {
  // Check availability
  const available = false // Simulated unavailability

  if (!available) {
    // Ask user for alternatives
    const response = await manager.requestInput({
      message: `No tables available at ${initialData.restaurant} on ${initialData.date}. Would you like to check alternative dates?`,
      requestedSchema: {
        type: 'object',
        properties: {
          checkAlternatives: {
            type: 'boolean',
            title: 'Check alternative dates',
            description: 'Would you like me to check other dates?',
          },
          flexibleDates: {
            type: 'string',
            title: 'Date flexibility',
            description: 'How flexible are your dates?',
            enum: ['next_day', 'same_week', 'next_week'],
            enumNames: ['Next day', 'Same week', 'Next week'],
          },
        },
        required: ['checkAlternatives'],
      },
    })

    if (response.action === 'accept' && response.content) {
      const data = response.content as Record<string, any>

      if (data.checkAlternatives) {
        // Find alternatives based on flexibility
        return {
          content: [
            {
              type: 'text',
              text: `Found alternatives for ${data.flexibleDates || 'next available'}`,
            },
          ],
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: 'No booking made. Original date not available.',
        },
      ],
    }
  }

  // Book the table
  return {
    content: [
      {
        type: 'text',
        text: `Booked table for ${initialData.partySize} at ${initialData.restaurant} on ${initialData.date}`,
      },
    ],
  }
}
