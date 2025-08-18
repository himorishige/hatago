export interface ChatGPTConnectorConfig {
  baseUrl?: string
  maxResults?: number
  mockMode?: boolean
  dataSource?: 'docs' | 'api' | 'github' // Optional data source for different mock data sets
}

// OpenAI Responses API compliant types
export interface OpenAISearchResult {
  id: string
  title: string
  text: string // relevant snippet for search terms
  url?: string
}

export interface OpenAIDocument {
  id: string
  title: string
  text: string // full text content
  url?: string
  metadata?: Record<string, unknown>
}

// Legacy types for backward compatibility
export interface Document {
  id: string
  title: string
  content: string
  url?: string
  text?: string // Optional text field for compatibility
}

export interface SearchResult {
  id: string
  title: string
  snippet: string
  url?: string
  score?: number
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
}
