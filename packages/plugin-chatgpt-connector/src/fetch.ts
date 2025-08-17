/**
 * Fetch tool implementation for ChatGPT MCP connector
 */
import type { HatagoPlugin } from '@hatago/core'
import { z } from 'zod'
import { MockDataSource } from './mock-data.js'
import type { ChatGPTConnectorConfig, Document } from './types.js'

/**
 * Creates the fetch tool for ChatGPT MCP connector
 */
export function createFetchTool(config: ChatGPTConnectorConfig = {}): HatagoPlugin {
  const { dataSource = new MockDataSource(config.baseUrl) } = config

  return ctx => {
    ctx.server.registerTool(
      'fetch',
      {
        title: 'Fetch Document',
        description:
          'Retrieve complete document content by ID for detailed analysis and citation. Use this after finding relevant documents with the search tool.',
        inputSchema: {
          id: z.string().describe('Unique identifier of the document to retrieve'),
        },
      },
      async (args: any) => {
        const { id } = args

        if (!id || !id.trim()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Document ID is required',
                }),
              },
            ],
          }
        }

        try {
          const document = await dataSource.fetch(id.trim())

          if (!document) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: `Document not found: ${id}`,
                  }),
                },
              ],
            }
          }

          // Return document in the format expected by ChatGPT
          const response: Document = {
            id: document.id,
            title: document.title,
            text: document.text,
            url: document.url,
            metadata: document.metadata,
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response),
              },
            ],
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
                }),
              },
            ],
          }
        }
      }
    )
  }
}
