/**
 * ChatGPT MCP Connector Plugin
 * Provides search and fetch tools for ChatGPT integration
 */

export { createSearchTool } from './search.js'
export { createFetchTool } from './fetch.js'
export type { ChatGPTConnectorConfig, Document, SearchResult, SearchResponse } from './types.js'
