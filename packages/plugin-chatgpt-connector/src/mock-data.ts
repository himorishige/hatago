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
  {
    id: 'tool-hello-hatago',
    title: 'Hello Hatago Tool - Progress Notification Demo',
    content:
      'The hello_hatago tool demonstrates MCP progress notifications in action. It streams the text "Hello Hatago" character by character with real-time progress updates. This tool requires no input parameters and returns the complete text when finished. It showcases the streaming capabilities of the MCP protocol and is perfect for testing progress notification features.',
    url: 'https://docs.hatago.dev/tools/hello-hatago',
  },
  {
    id: 'available-tools',
    title: 'Available MCP Tools in Hatago',
    content:
      'Hatago provides several MCP tools out of the box: hello_hatago (progress notification demo), search (document search with relevance scoring), fetch (retrieve full documents), github_user (get GitHub user info), github_repos (list repositories), github_search (search GitHub), and github_issues (list issues). Each tool follows MCP protocol specifications and can be accessed through the standard tools/call method.',
    url: 'https://docs.hatago.dev/tools',
  },
  {
    id: 'chatgpt-integration',
    title: 'ChatGPT Integration with Hatago',
    content:
      'Hatago includes a ChatGPT connector plugin that enables seamless integration with OpenAI Responses API. The connector provides search and fetch tools that comply with OpenAI specifications. Search returns an array of results with id, title, text, and url fields. Fetch retrieves complete documents with optional metadata. Configure with CHATGPT_MODE=true to enable the connector.',
    url: 'https://docs.hatago.dev/integrations/chatgpt',
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

// Document metadata for enhanced information
const documentMetadata: Record<string, Record<string, unknown>> = {
  'hatago-001': { category: 'framework', version: '0.3.1' },
  'mcp-002': { category: 'protocol', specification: '2025-06-18' },
  'plugin-003': { category: 'development', difficulty: 'intermediate' },
  'tool-hello-hatago': { category: 'tools', type: 'demo', interactive: true },
  'available-tools': { category: 'tools', type: 'reference' },
  'chatgpt-integration': { category: 'integration', provider: 'openai' },
}

export function getDocumentMetadata(id: string): Record<string, unknown> | undefined {
  return documentMetadata[id]
}

// Export aliases for consistency
export const searchDocuments = searchMockDocuments
export const fetchDocument = getMockDocument

// Mock data source type for configuration
export type MockDataSource = 'docs' | 'api' | 'github'
