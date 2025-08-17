# @hatago/plugin-chatgpt-connector

ChatGPT MCP Connector Plugin for Hatago framework. This plugin implements the search and fetch tools required for ChatGPT integration according to OpenAI MCP specification.

## Features

- **Search Tool**: Searches documents and returns relevant results with snippets
- **Fetch Tool**: Retrieves complete documents by ID
- **SSE Transport**: Server-Sent Events support for ChatGPT streaming
- **Mock Data Source**: Built-in test data for development and demonstration
- **Configurable**: Environment-based configuration for different deployment stages

## Installation

```bash
pnpm add @hatago/plugin-chatgpt-connector
```

## Usage

### Basic Usage

```typescript
import { chatGPTConnector } from '@hatago/plugin-chatgpt-connector'

export const plugins = [
  chatGPTConnector({
    baseUrl: 'https://docs.example.com/',
    maxResults: 10,
    mockMode: true,
  }),
]
```

### Environment Variables

The plugin supports configuration via environment variables:

- `CHATGPT_MODE`: Enable/disable ChatGPT connector (`true`/`false`)
- `CHATGPT_BASE_URL`: Base URL for document links (default: `https://docs.hatago.dev/`)
- `CHATGPT_MAX_RESULTS`: Maximum search results to return (default: `10`)

### Configuration Options

```typescript
interface ChatGPTConnectorConfig {
  /** Base URL for document URLs (e.g., 'https://example.com/docs/') */
  baseUrl?: string
  /** Maximum number of search results to return */
  maxResults?: number
  /** Enable mock data mode for testing */
  mockMode?: boolean
  /** Custom data source handler */
  dataSource?: DataSource
}
```

## ChatGPT Integration

### MCP Tools

The plugin registers two MCP tools required by ChatGPT:

1. **search**: Searches for documents matching a query
   - Input: `{ query: string }`
   - Output: `{ results: SearchResult[] }`

2. **fetch**: Retrieves a complete document by ID
   - Input: `{ id: string }`
   - Output: `Document` object

### Response Formats

#### Search Response

```typescript
interface SearchResult {
  id: string      // Unique identifier
  title: string   // Document title
  text: string    // Relevant snippet
  url?: string    // Optional URL for citations
}
```

#### Fetch Response

```typescript
interface Document {
  id: string                     // Unique identifier
  title: string                  // Document title
  text: string                   // Full document content
  url?: string                   // Optional URL
  metadata?: Record<string, any> // Optional metadata
}
```

## Custom Data Sources

You can implement custom data sources by implementing the `DataSource` interface:

```typescript
import type { DataSource } from '@hatago/plugin-chatgpt-connector'

class CustomDataSource implements DataSource {
  async search(query: string, limit = 10): Promise<SearchResult[]> {
    // Implement your search logic
    return []
  }

  async fetch(id: string): Promise<Document | null> {
    // Implement your fetch logic
    return null
  }
}

// Use with the plugin
chatGPTConnector({
  dataSource: new CustomDataSource(),
})
```

## Deployment

### Cloudflare Workers

The plugin works seamlessly with Cloudflare Workers. Example deployment configuration:

```json
// wrangler.jsonc
{
  "vars": {
    "CHATGPT_MODE": "true",
    "CHATGPT_BASE_URL": "https://your-worker.workers.dev/",
    "CHATGPT_MAX_RESULTS": "20"
  }
}
```

### Deploy Commands

```bash
# Development environment
pnpm deploy:dev

# Staging environment
pnpm deploy:staging

# Production environment
pnpm deploy:prod
```

## Testing

### Local Development

```bash
# Start development server with ChatGPT connector
CHATGPT_MODE=true pnpm dev

# Test search tool
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"query":"MCP protocol"}}}'

# Test fetch tool
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fetch","arguments":{"id":"doc-1"}}}'
```

### Mock Data

The plugin includes 5 sample documents for testing:

1. **doc-1**: Introduction to MCP
2. **doc-2**: ChatGPT Integration Guide
3. **doc-3**: Hatago Framework Overview
4. **doc-4**: Cloudflare Workers Deployment
5. **doc-5**: Authentication and Security

## API Reference

### Main Export

- `chatGPTConnector(config?)`: Creates the ChatGPT connector plugin

### Types

- `ChatGPTConnectorConfig`: Plugin configuration interface
- `SearchResult`: Search result item interface
- `SearchResponse`: Search tool response interface
- `Document`: Document interface for fetch tool
- `DataSource`: Interface for custom data sources

### Utilities

- `MockDataSource`: Built-in mock data source implementation
- `createSearchTool(config)`: Creates standalone search tool
- `createFetchTool(config)`: Creates standalone fetch tool

## Security Considerations

- Input validation is automatically handled for all tool inputs
- PII masking is enabled by default in production environments
- CORS headers are configured for ChatGPT integration
- Bearer token authentication can be enabled via `REQUIRE_AUTH=true`

## License

MIT