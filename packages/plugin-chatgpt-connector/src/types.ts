export interface ChatGPTConnectorConfig {
  baseUrl?: string
  maxResults?: number
  mockMode?: boolean
}

export interface Document {
  id: string
  title: string
  content: string
  url?: string
}

export interface SearchResult {
  id: string
  title: string
  snippet: string
  url?: string
  score?: number
}