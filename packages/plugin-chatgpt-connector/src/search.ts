/**
 * Search tool implementation for ChatGPT MCP connector
 */
import type { HatagoPlugin } from '@hatago/core'
import { z } from 'zod'
import { searchDocuments } from './mock-data.js'
import type { ChatGPTConnectorConfig, SearchResponse } from './types.js'

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
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  results: [],
                  total: 0,
                } as SearchResponse),
              },
            ],
          }
        }

        try {
          // For now, we use mock data
          const results = searchDocuments(query.trim(), maxResults)

          const response: SearchResponse = {
            results,
            total: results.length,
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
                  results: [],
                  error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
                }),
              },
            ],
          }
        }
      }
    )
  }
}
