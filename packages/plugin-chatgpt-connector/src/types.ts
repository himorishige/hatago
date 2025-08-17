export interface ChatGPTConnectorConfig {
  baseUrl?: string
  maxResults?: number
  mockMode?: boolean
  dataSource?: 'docs' | 'api' | 'github' // Optional data source for different mock data sets
}

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
