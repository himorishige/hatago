import type { Document, SearchResult } from './types.js'

export const mockDocuments: Document[] = [
  {
    id: 'hatago-001',
    title: 'Hatago - Lightweight MCP Server',
    content:
      'Hatago is a lightweight, fast, and simple remote MCP (Model Context Protocol) server built with Hono + @hono/mcp + MCP TypeScript SDK. It features a plugin-based architecture for extensibility and runs on Node.js, Cloudflare Workers, Deno, and Bun.',
    url: 'https://docs.hatago.dev/overview',
  },
  {
    id: 'mcp-002',
    title: 'MCP Protocol Overview',
    content:
      'The Model Context Protocol (MCP) is an open protocol that enables seamless integration between LLM applications and external data sources and tools. It provides a standardized way for AI assistants to access context and take actions through tool functions.',
    url: 'https://docs.hatago.dev/mcp-protocol',
  },
  {
    id: 'plugin-003',
    title: 'Creating Hatago Plugins',
    content:
      'Hatago plugins follow the HatagoPlugin type pattern: (ctx: HatagoContext) => void | Promise<void>. The context provides access to the Hono app instance for HTTP routes and the MCP server instance for registering tools and resources.',
    url: 'https://docs.hatago.dev/plugins',
  },
]

export function searchMockDocuments(query: string, maxResults: number): SearchResult[] {
  const lowerQuery = query.toLowerCase()
  const results: SearchResult[] = []

  for (const doc of mockDocuments) {
    const titleScore = doc.title.toLowerCase().includes(lowerQuery) ? 0.8 : 0
    const contentScore = doc.content.toLowerCase().includes(lowerQuery) ? 0.5 : 0
    const score = Math.max(titleScore, contentScore)

    if (score > 0) {
      const snippet = extractSnippet(doc.content, lowerQuery, 150)
      results.push({
        id: doc.id,
        title: doc.title,
        snippet,
        url: doc.url,
        score,
      })
    }
  }

  // Sort by score and limit results
  return results.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, maxResults)
}

export function getMockDocument(id: string): Document | undefined {
  return mockDocuments.find(doc => doc.id === id)
}

function extractSnippet(content: string, query: string, maxLength: number): string {
  const lowerContent = content.toLowerCase()
  const index = lowerContent.indexOf(query.toLowerCase())

  if (index === -1) {
    // Query not found, return beginning of content
    return content.length > maxLength ? `${content.substring(0, maxLength)}...` : content
  }

  // Extract snippet around the query
  const start = Math.max(0, index - 50)
  const end = Math.min(content.length, index + query.length + 100)
  let snippet = content.substring(start, end)

  if (start > 0) snippet = `...${snippet}`
  if (end < content.length) snippet = `${snippet}...`

  return snippet
}

// Export aliases for consistency
export const searchDocuments = searchMockDocuments
export const fetchDocument = getMockDocument

// Mock data source type for configuration
export type MockDataSource = 'docs' | 'api' | 'github'
