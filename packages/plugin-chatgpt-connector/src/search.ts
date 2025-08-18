/**
 * Search tool implementation for ChatGPT MCP connector
 */
import type { HatagoPlugin } from '@hatago/core'
import { z } from 'zod'
import { searchDocuments } from './mock-data.js'
import type { ChatGPTConnectorConfig, OpenAISearchResult } from './types.js'

/**
 * Creates the search tool for ChatGPT MCP connector
 */
export function createSearchTool(config: ChatGPTConnectorConfig = {}): HatagoPlugin {
  const { maxResults = 10 } = config

  return ctx => {
    ctx.server.registerTool(
      'search',
      {
        title: 'Search Documents',
        description:
          'Search for documents and return relevant results with snippets. Used for finding information across the knowledge base.',
        inputSchema: {
          query: z.string().describe('Search query to find relevant documents'),
        },
      },
      async (args: any) => {
        const { query } = args

        if (!query || !query.trim()) {
          // Return empty array for OpenAI compliance
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify([]),
              },
            ],
          }
        }

        try {
          // For now, we use mock data
          const searchResults = searchDocuments(query.trim(), maxResults)

          // Convert to OpenAI format
          const openAIResults: OpenAISearchResult[] = searchResults.map(result => ({
            id: result.id,
            title: result.title,
            text: result.snippet, // snippet becomes text
            url: result.url,
          }))

          // Return array directly for OpenAI compliance
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(openAIResults),
              },
            ],
          }
        } catch (_error) {
          // Return empty array with error (OpenAI format)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify([]),
              },
            ],
            isError: true,
          }
        }
      }
    )
  }
}
