# stdio MCP Server Bridge Container
FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

WORKDIR /app

# Install mcp-proxy for stdio to SSE bridge
RUN npm install -g mcp-proxy@latest

# Create a simple stdio MCP server for testing
RUN mkdir -p /app/test-server

# Create a test stdio MCP server
COPY <<EOF /app/test-server/server.js
#!/usr/bin/env node

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Simple stdio MCP server that responds to JSON-RPC requests
rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    
    // Handle different MCP methods
    let response;
    switch (request.method) {
      case 'initialize':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: {
              name: 'test-stdio-server',
              version: '1.0.0'
            }
          }
        };
        break;
        
      case 'tools/list':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [
              {
                name: 'echo',
                description: 'Echo back the input',
                parameters: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' }
                  }
                }
              }
            ]
          }
        };
        break;
        
      case 'tools/call':
        if (request.params.name === 'echo') {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Echo: ' + (request.params.arguments.message || 'no message')
                }
              ]
            }
          };
        }
        break;
        
      default:
        response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
    }
    
    console.log(JSON.stringify(response));
  } catch (error) {
    console.error(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error'
      }
    }));
  }
});
EOF

RUN chmod +x /app/test-server/server.js

# Environment variables
ENV MCP_PROXY_PORT=8080
ENV MCP_SERVER_CMD="node /app/test-server/server.js"

# Expose the port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start mcp-proxy with stdio server
CMD ["sh", "-c", "mcp-proxy --port $MCP_PROXY_PORT -- $MCP_SERVER_CMD"]