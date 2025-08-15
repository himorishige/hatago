# Integrating GitHub MCP Server with Hatago

## Overview

This guide explains how to integrate GitHub's official MCP server (`github-mcp-server`) with your Hatago setup. The GitHub MCP server provides powerful GitHub integration capabilities including repository management, issue tracking, and pull request operations through MCP tools.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Method 1: External MCP Server Integration](#method-1-external-mcp-server-integration)
- [Method 2: Docker Compose Setup](#method-2-docker-compose-setup)
- [Method 3: Plugin Wrapper (Advanced)](#method-3-plugin-wrapper-advanced)
- [Available GitHub Tools](#available-github-tools)
- [Configuration Examples](#configuration-examples)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Prerequisites

### Required Components

- **Hatago CLI 0.1.0+** with external MCP server support
- **Node.js 18+** for running github-mcp-server
- **GitHub Personal Access Token** with appropriate permissions
- **Hatago project** with external server proxy configured

### GitHub Token Setup

1. **Create Personal Access Token**
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Generate new token (classic) or fine-grained token
   - Required scopes:
     - `repo` (full repository access)
     - `issues` (read/write issues)
     - `pull_requests` (read/write pull requests)
     - `actions` (if using GitHub Actions integration)

2. **Environment Variable**
   ```bash
   export GITHUB_TOKEN="your_github_token_here"
   ```

### Installation

Install github-mcp-server:

```bash
# Global installation
npm install -g @github/github-mcp-server

# Or use without installation
npx @github/github-mcp-server --help
```

## Method 1: External MCP Server Integration

This is the recommended approach using Hatago's built-in external MCP server proxy functionality.

### Step 1: Start GitHub MCP Server

```bash
# Start github-mcp-server on port 3001
GITHUB_TOKEN="${GITHUB_TOKEN}" npx @github/github-mcp-server --port 3001

# Or with specific configuration
GITHUB_TOKEN="${GITHUB_TOKEN}" npx @github/github-mcp-server \
  --port 3001 \
  --host localhost \
  --log-level info
```

### Step 2: Add to Hatago Configuration

Using Hatago CLI:

```bash
# Add github-mcp-server as external server
hatago add-server http://localhost:3001/mcp \
  --id github \
  --namespace github \
  --description "GitHub integration via official MCP server" \
  --timeout 30000 \
  --test
```

This will update your `hatago.config.jsonc`:

```json
{
  "$schema": "https://hatago.dev/schema/config.json",
  "proxy": {
    "servers": [
      {
        "id": "github",
        "endpoint": "http://localhost:3001/mcp",
        "namespace": "github",
        "description": "GitHub integration via official MCP server",
        "timeout": 30000,
        "healthCheck": {
          "enabled": true,
          "interval": 60000,
          "timeout": 5000
        }
      }
    ],
    "namespaceStrategy": "prefix",
    "conflictResolution": "warn"
  }
}
```

### Step 3: Start Hatago Server

```bash
# Set GitHub token for the session
export GITHUB_TOKEN="your_github_token_here"

# Start Hatago with GitHub integration
hatago dev
```

### Step 4: Test Integration

```bash
# List available tools (should include github.* tools)
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# Test GitHub tool
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "github.search_repositories",
      "arguments": {
        "query": "hatago mcp"
      }
    }
  }'
```

## Method 2: Docker Compose Setup

For production deployments or when you want both servers managed together.

### Docker Compose Configuration

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  hatago:
    build: .
    ports:
      - '8787:8787'
    environment:
      - NODE_ENV=production
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    volumes:
      - ./hatago.config.jsonc:/app/hatago.config.jsonc:ro
    depends_on:
      - github-mcp-server
    networks:
      - hatago-network

  github-mcp-server:
    image: node:20-alpine
    command: >
      sh -c "npm install -g @github/github-mcp-server &&
             github-mcp-server --port 3000 --host 0.0.0.0"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    ports:
      - '3001:3000'
    networks:
      - hatago-network
    healthcheck:
      test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  hatago-network:
    driver: bridge
```

### Configuration for Docker Setup

Update `hatago.config.jsonc`:

```json
{
  "proxy": {
    "servers": [
      {
        "id": "github",
        "endpoint": "http://github-mcp-server:3000/mcp",
        "namespace": "github",
        "description": "GitHub integration via Docker service",
        "timeout": 30000,
        "retry": {
          "attempts": 3,
          "delay": 1000
        },
        "healthCheck": {
          "enabled": true,
          "interval": 60000
        }
      }
    ]
  }
}
```

### Start Docker Setup

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f hatago
docker-compose logs -f github-mcp-server

# Stop services
docker-compose down
```

## Method 3: Plugin Wrapper (Advanced)

For deeper integration, you can create a Hatago plugin that wraps github-mcp-server functionality.

### Create GitHub Integration Plugin

```bash
# Create plugin using Hatago CLI
hatago create-plugin github-integration --interactive
```

### Plugin Implementation

`src/plugins/github-integration.ts`:

```typescript
import type { HatagoPlugin } from '@hatago/types'
import { spawn, ChildProcess } from 'child_process'
import fetch from 'node-fetch'

interface GitHubMCPConfig {
  port: number
  host: string
  token: string
  autoStart: boolean
}

export const githubIntegrationPlugin: HatagoPlugin = async ({ server, app, env, getBaseUrl }) => {
  const config: GitHubMCPConfig = {
    port: parseInt(env?.GITHUB_MCP_PORT as string) || 3001,
    host: (env?.GITHUB_MCP_HOST as string) || 'localhost',
    token: env?.GITHUB_TOKEN as string,
    autoStart: env?.GITHUB_MCP_AUTO_START === 'true',
  }

  if (!config.token) {
    throw new Error('GITHUB_TOKEN environment variable is required')
  }

  let githubMCPProcess: ChildProcess | null = null

  // Auto-start github-mcp-server if configured
  if (config.autoStart) {
    githubMCPProcess = spawn(
      'npx',
      ['@github/github-mcp-server', '--port', config.port.toString()],
      {
        env: { ...process.env, GITHUB_TOKEN: config.token },
        stdio: 'pipe',
      }
    )

    githubMCPProcess.stdout?.on('data', data => {
      console.log(`[GitHub MCP] ${data}`)
    })

    githubMCPProcess.stderr?.on('data', data => {
      console.error(`[GitHub MCP Error] ${data}`)
    })

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  // Proxy GitHub tools through Hatago
  const githubMCPEndpoint = `http://${config.host}:${config.port}/mcp`

  // Helper function to call github-mcp-server
  async function callGitHubMCP(method: string, params: any) {
    const response = await fetch(githubMCPEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    })

    const result = await response.json()
    if (result.error) {
      throw new Error(`GitHub MCP Error: ${result.error.message}`)
    }
    return result.result
  }

  // Register common GitHub tools
  server.registerTool(
    {
      name: 'github.create_issue',
      description: 'Create a new GitHub issue',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body' },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Issue labels',
          },
        },
        required: ['owner', 'repo', 'title'],
      },
    },
    async params => {
      try {
        const result = await callGitHubMCP('tools/call', {
          name: 'create_issue',
          arguments: params,
        })

        return {
          content: [
            {
              type: 'text',
              text: `Issue created successfully: ${result.content[0].text}`,
            },
          ],
        }
      } catch (error) {
        throw new Error(`Failed to create issue: ${error.message}`)
      }
    }
  )

  server.registerTool(
    {
      name: 'github.search_repositories',
      description: 'Search GitHub repositories',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          sort: {
            type: 'string',
            enum: ['stars', 'forks', 'updated'],
            description: 'Sort criteria',
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort order',
          },
          per_page: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            description: 'Results per page',
          },
        },
        required: ['query'],
      },
    },
    async params => {
      try {
        const result = await callGitHubMCP('tools/call', {
          name: 'search_repositories',
          arguments: params,
        })

        return {
          content: result.content,
        }
      } catch (error) {
        throw new Error(`Failed to search repositories: ${error.message}`)
      }
    }
  )

  // HTTP endpoint for GitHub webhook
  app.post('/github/webhook', async c => {
    const payload = await c.req.json()
    const event = c.req.header('x-github-event')

    // Process GitHub webhook
    console.log(`Received GitHub webhook: ${event}`, payload)

    // You can trigger MCP tools based on webhook events
    if (event === 'issues' && payload.action === 'opened') {
      // Auto-label new issues, etc.
    }

    return c.json({ status: 'ok' })
  })

  // Resource for GitHub configuration
  server.registerResource(
    {
      uri: 'github://config',
      name: 'GitHub Integration Configuration',
      description: 'Current GitHub MCP integration settings',
      mimeType: 'application/json',
    },
    async () => {
      return {
        contents: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                endpoint: githubMCPEndpoint,
                autoStart: config.autoStart,
                hasToken: !!config.token,
                processRunning: !!githubMCPProcess,
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )

  // Cleanup on shutdown
  process.on('exit', () => {
    if (githubMCPProcess) {
      githubMCPProcess.kill('SIGTERM')
    }
  })
}

export default githubIntegrationPlugin
```

### Plugin Configuration

Add to your `hatago.plugin.json`:

```json
{
  "name": "github-integration",
  "displayName": "GitHub Integration",
  "version": "1.0.0",
  "description": "GitHub integration via official MCP server",
  "hatago": {
    "dependencies": {
      "env": ["GITHUB_TOKEN"]
    },
    "configuration": {
      "githubToken": {
        "type": "string",
        "required": true,
        "description": "GitHub Personal Access Token"
      },
      "autoStart": {
        "type": "boolean",
        "default": false,
        "description": "Auto-start github-mcp-server process"
      }
    }
  }
}
```

## Available GitHub Tools

The github-mcp-server provides numerous tools for GitHub integration:

### Repository Management

- `github.create_repository` - Create a new repository
- `github.get_repository` - Get repository information
- `github.list_repositories` - List user/organization repositories
- `github.search_repositories` - Search repositories

### Issue Management

- `github.create_issue` - Create new issue
- `github.get_issue` - Get issue details
- `github.list_issues` - List repository issues
- `github.update_issue` - Update issue
- `github.add_labels_to_issue` - Add labels to issue

### Pull Request Management

- `github.create_pull_request` - Create new pull request
- `github.get_pull_request` - Get pull request details
- `github.list_pull_requests` - List repository pull requests
- `github.merge_pull_request` - Merge pull request

### File Operations

- `github.get_file_contents` - Get file contents
- `github.create_or_update_file` - Create or update file
- `github.search_code` - Search code in repositories

### Organization Management

- `github.list_organization_repositories` - List org repositories
- `github.get_organization` - Get organization details

## Configuration Examples

### Basic Setup

```json
{
  "proxy": {
    "servers": [
      {
        "id": "github",
        "endpoint": "http://localhost:3001/mcp",
        "namespace": "github",
        "description": "GitHub official MCP server"
      }
    ]
  }
}
```

### Advanced Setup with Auth and Health Checks

```json
{
  "proxy": {
    "servers": [
      {
        "id": "github",
        "endpoint": "http://localhost:3001/mcp",
        "namespace": "github",
        "description": "GitHub official MCP server",
        "timeout": 30000,
        "retry": {
          "attempts": 3,
          "delay": 1000
        },
        "healthCheck": {
          "enabled": true,
          "interval": 60000,
          "timeout": 5000,
          "retries": 3
        },
        "tools": {
          "include": ["create_issue", "search_repositories", "get_repository"],
          "exclude": ["create_repository"],
          "rename": {
            "create_issue": "github_create_issue"
          }
        }
      }
    ],
    "namespaceStrategy": "prefix",
    "conflictResolution": "warn"
  }
}
```

### Environment Variables

```bash
# Required
export GITHUB_TOKEN="ghp_your_token_here"

# Optional
export GITHUB_MCP_PORT="3001"
export GITHUB_MCP_HOST="localhost"
export GITHUB_MCP_AUTO_START="false"
export GITHUB_API_BASE_URL="https://api.github.com"
```

## Troubleshooting

### Common Issues

#### 1. GitHub Token Authentication Errors

**Problem**: `401 Unauthorized` responses from GitHub API

**Solution**:

```bash
# Verify token has correct permissions
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

# Check token scopes
curl -H "Authorization: Bearer $GITHUB_TOKEN" -I https://api.github.com/user
```

#### 2. Connection Refused Errors

**Problem**: Hatago cannot connect to github-mcp-server

**Solution**:

```bash
# Check if github-mcp-server is running
curl http://localhost:3001/health

# Start github-mcp-server manually
GITHUB_TOKEN="$GITHUB_TOKEN" npx @github/github-mcp-server --port 3001

# Check Hatago configuration
hatago config validate
```

#### 3. Namespace Conflicts

**Problem**: Tool name conflicts between servers

**Solution**:

```json
{
  "proxy": {
    "servers": [
      {
        "id": "github",
        "namespace": "github",
        "tools": {
          "rename": {
            "search": "github_search",
            "create": "github_create"
          }
        }
      }
    ],
    "namespaceStrategy": "prefix",
    "conflictResolution": "error"
  }
}
```

#### 4. Rate Limiting

**Problem**: GitHub API rate limit exceeded

**Solution**:

- Use authenticated requests (higher rate limits)
- Implement exponential backoff
- Monitor rate limit headers
- Consider GitHub App authentication for higher limits

### Debug Mode

Enable debug logging:

```bash
# Start github-mcp-server with debug logs
DEBUG=* GITHUB_TOKEN="$GITHUB_TOKEN" npx @github/github-mcp-server --port 3001

# Start Hatago with verbose logging
HATAGO_DEBUG=true hatago dev

# Test specific tool with debug info
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"github.get_repository","arguments":{"owner":"github","repo":"github-mcp-server"}}}' | jq
```

## Best Practices

### Security

1. **Token Management**
   - Use environment variables for tokens
   - Rotate tokens regularly
   - Use fine-grained tokens when possible
   - Never commit tokens to version control

2. **Network Security**
   - Run services on localhost in development
   - Use HTTPS in production
   - Implement rate limiting
   - Monitor API usage

### Performance

1. **Connection Management**
   - Implement connection pooling
   - Set appropriate timeouts
   - Use health checks
   - Handle network failures gracefully

2. **Caching**
   - Cache repository metadata
   - Use conditional requests (ETags)
   - Implement client-side caching
   - Respect GitHub's cache headers

### Monitoring

1. **Health Checks**
   - Monitor both services
   - Check API connectivity
   - Track error rates
   - Set up alerting

2. **Logging**
   - Log all API calls
   - Track performance metrics
   - Monitor rate limits
   - Audit sensitive operations

### Development Workflow

1. **Testing**
   - Test with different repositories
   - Verify permissions
   - Test error scenarios
   - Use GitHub's test repositories

2. **Documentation**
   - Document available tools
   - Provide usage examples
   - Document configuration options
   - Maintain troubleshooting guides

## Integration Examples

### Example 1: Repository Search and Clone

```bash
# Search for repositories
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "github.search_repositories",
      "arguments": {
        "query": "language:typescript mcp",
        "sort": "stars",
        "order": "desc",
        "per_page": 5
      }
    }
  }'
```

### Example 2: Create Issue with Labels

```bash
# Create an issue
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "github.create_issue",
      "arguments": {
        "owner": "your-username",
        "repo": "your-repo",
        "title": "Integration test issue",
        "body": "This issue was created via Hatago + GitHub MCP integration",
        "labels": ["enhancement", "integration"]
      }
    }
  }'
```

### Example 3: File Content Management

```bash
# Get file contents
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "github.get_file_contents",
      "arguments": {
        "owner": "github",
        "repo": "github-mcp-server",
        "path": "README.md"
      }
    }
  }'
```

This comprehensive guide covers all the essential aspects of integrating github-mcp-server with Hatago. Choose the method that best fits your deployment scenario and requirements.
