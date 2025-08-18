/**
 * Fetch tool implementation for ChatGPT MCP connector
 */
import type { HatagoPlugin } from '@hatago/core'
import { z } from 'zod'
import { fetchDocument, getDocumentMetadata } from './mock-data.js'
import type { ChatGPTConnectorConfig, OpenAIDocument } from './types.js'

/**
 * Creates the fetch tool for ChatGPT MCP connector
 */
export function createFetchTool(_config: ChatGPTConnectorConfig = {}): HatagoPlugin {
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
            isError: true,
          }
        }

        try {
          // For now, we use mock data
          const document = fetchDocument(id.trim())

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
              isError: true,
            }
          }

          // Get metadata if available
          const metadata = getDocumentMetadata ? getDocumentMetadata(id.trim()) : undefined

          // Return document in OpenAI format
          const response: OpenAIDocument = {
            id: document.id,
            title: document.title,
            text: document.content, // content becomes text
            url: document.url,
            ...(metadata && { metadata }),
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
            isError: true,
          }
        }
      }
    )
  }
}
