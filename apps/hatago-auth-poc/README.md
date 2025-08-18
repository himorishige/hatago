# Hatago Authentication POC

This is a proof of concept for integrating OAuth authentication with MCP servers running in Cloudflare Containers, enabling secure access to stdio-based MCP servers through a unified authentication layer.

## Overview

This POC demonstrates:

- OAuth 2.1 authentication for MCP servers using Cloudflare Workers
- stdio MCP server execution in Cloudflare Containers
- Permission-based access control for MCP tools
- Bridge between HTTP/SSE and stdio communication
- Integration with Cloudflare Access, GitHub OAuth, or mock authentication

## Architecture

```
[MCP Client] → OAuth → [Hatago Auth POC on Workers] → [Container with stdio Bridge]
                              ↓                                ↓
                      [Permission System]              [stdio MCP Server]
```

## Features

- **Multi-Provider Authentication**: Support for Cloudflare Access, GitHub OAuth, and mock authentication
- **stdio Bridge**: Automatic conversion between stdio and HTTP/SSE protocols
- **Permission Management**: Role-based access control for MCP tools and servers
- **Container Integration**: stdio MCP servers run in isolated Cloudflare Containers
- **Dual Transport**: Support for both SSE and Streamable HTTP transport methods

## Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Cloudflare account with Workers Paid plan ($5/month)
- Wrangler CLI installed globally

### Installation

1. Clone the repository and navigate to the POC directory:

```bash
cd apps/hatago-auth-poc
```

2. Install dependencies:

```bash
pnpm install
```

3. Copy the environment variables template:

```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`

### Database Setup

Initialize the D1 database for permissions:

```bash
# Create the database
wrangler d1 create hatago-permissions

# Update wrangler.toml with the database ID
# Then run migrations
wrangler d1 execute hatago-permissions --file=./schema.sql
```

### KV Namespace Setup

Create the KV namespace for OAuth tokens:

```bash
wrangler kv:namespace create "OAUTH_KV"
```

## Development

### Local Development

Start the development server:

```bash
pnpm dev
```

The server will be available at `http://localhost:8787`

### Testing Authentication

1. **Mock Authentication** (default):
   - Navigate to `http://localhost:8787/authorize`
   - Use any email/name for testing

2. **Cloudflare Access**:
   - Set `AUTH_TYPE=cloudflare-access` in `.env`
   - Configure Access credentials
   - Users will be redirected to your IdP

3. **GitHub OAuth**:
   - Set `AUTH_TYPE=github` in `.env`
   - Configure GitHub OAuth app credentials
   - Users will authenticate via GitHub

### Testing with MCP Inspector

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Run the inspector
mcp-inspector

# Connect to: http://localhost:8787/sse
```

## Deployment

### Deploy to Cloudflare Workers

```bash
pnpm deploy
```

### Production Configuration

For production, ensure:

- `AUTH_TYPE` is set to `cloudflare-access` or `github`
- All OAuth credentials are configured as secrets
- Database and KV namespaces are properly bound
- Container images are built and deployed

## API Endpoints

### OAuth Endpoints

- `GET /authorize` - OAuth authorization endpoint
- `POST /token` - Token exchange endpoint
- `POST /register` - Client registration endpoint

### MCP Endpoints

- `/sse` - Server-Sent Events transport for MCP
- `/mcp` - Streamable HTTP transport for MCP

### Container Management

- `/health` - Health check for stdio bridge
- `/execute` - Execute commands on stdio server

## Permission System

### User Permissions

Permissions are stored in D1 database with the following structure:

- `userId`: Unique user identifier
- `servers`: Array of accessible server IDs
- `permissions`: Array of permission strings
- `groups`: Array of group memberships

### Permission Levels

- `read` - Basic read access (default)
- `write` - Can modify data
- `execute` - Can execute commands on stdio servers
- `admin` - Full administrative access

### Tool Access Control

Tools are dynamically registered based on user permissions:

```javascript
// Only users with 'execute' permission see this tool
if (userPermissions.includes('execute')) {
  server.tool('execute_stdio', ...)
}
```

## Container Configuration

The stdio bridge container runs with:

- Instance type: `dev` (minimal resources for POC)
- Sleep after: 10 minutes of inactivity
- Port: 8080 (internal)

### Custom stdio Servers

To add your own stdio MCP server:

1. Modify `src/containers/Dockerfile`
2. Add your server executable
3. Update `MCP_SERVER_CMD` environment variable
4. Rebuild and deploy

## Security Considerations

- All OAuth tokens are encrypted and stored in KV
- Service tokens are used for inter-service communication
- Container isolation ensures stdio servers can't access other resources
- Permission checks are enforced at multiple levels
- All actions are logged for audit purposes

## Troubleshooting

### Common Issues

1. **Container fails to start**:
   - Check Docker build logs
   - Verify mcp-proxy installation
   - Ensure stdio server is executable

2. **Authentication fails**:
   - Verify OAuth credentials
   - Check redirect URIs match configuration
   - Ensure cookies are enabled

3. **Permission denied errors**:
   - Check user permissions in database
   - Verify permission middleware is applied
   - Review audit logs

## Next Steps

This POC can be extended to:

- Add more OAuth providers (Auth0, WorkOS, etc.)
- Implement session management
- Add rate limiting and DDoS protection
- Create admin UI for permission management
- Support multiple stdio servers per container
- Implement health monitoring and alerting

## License

MIT
