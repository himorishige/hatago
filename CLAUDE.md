# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hatago is a lightweight, fast, and simple remote MCP (Model Context Protocol) server built with **Hono + @hono/mcp + MCP TypeScript SDK**. It features a plugin-based architecture for extensibility.

## Hatago Core Principles

- **高速・軽量・シンプル**: Performance-first design, minimal dependencies, simple API architecture
- **Simplicity First (SF)**: Always choose the simplest viable solution, complex implementations require clear justification
- **Dependency Minimalism (DM)**: Strictly review new dependency additions, prioritize existing functionality utilization
- **Functional Programming Priority**: Pure functions, minimize side effects, immutable data, function composition

## Specification Compliance Requirements

- **Hono Framework**: Middleware patterns, context management, type-safe routing
- **Anthropic MCP Specification (2025-06-18)**: JSON-RPC 2.0, transport layer, security best practices
- **RFC Standards**: OAuth 2.1, RFC 9728 Protected Resource Metadata, HTTP/HTTPS standards

## Architecture Philosophy

- **Core Philosophy**: Keep the core minimal and extend functionality through plugins
- **Environment Agnostic**: Runs on Node.js, Cloudflare Workers, Deno, and Bun
- **Plugin System**: OAuth PRM publishing and streaming "Hello Hatago" test tool included

## Development Commands

```bash
# Install dependencies
pnpm i

# Start development server (Node.js HTTP mode)
pnpm dev
# → Access http://localhost:8787/health to verify

# Start development server (stdio mode for Claude Desktop)
pnpm dev:stdio
# → Use in Claude Desktop MCP configuration

# Start development server (Cloudflare Workers)
pnpm dev:cf

# Build the project
pnpm build

# Type checking
pnpm typecheck

# Start production server (HTTP mode)
pnpm start

# Start production server (stdio mode)
pnpm start:stdio
```

## Architecture Overview

### Core Components

- **`src/app.ts`**: Main application entry point that creates Hono app and MCP server
- **`src/stdio-server.ts`**: stdio transport server for direct Claude Desktop integration
- **`src/system/`**: Core system components
  - `plugins.ts`: Plugin loader that applies plugins to the context
  - `types.ts`: Core type definitions including `HatagoContext` and `HatagoPlugin`
- **`src/config/`**: Configuration management system
  - `loader.ts`: Configuration file loader for hatago.config.json
  - `namespace-manager.ts`: Namespace management for MCP proxy functionality
  - `types.ts`: Configuration type definitions
- **`src/utils/`**: Utility components
  - `logger.ts`: Noren-integrated structured logger with PII masking
- **`src/plugins/`**: Plugin implementations
  - `index.ts`: Default plugin configuration
  - `hello-hatago.ts`: Demo plugin that streams "Hello Hatago" with progress notifications
  - `oauth-metadata.ts`: OAuth Protected Resource Metadata (RFC 9728) support
  - `enhanced-mcp-proxy.ts`: MCP proxy with namespace management and configuration
  - `github-oauth-test.ts`: GitHub OAuth integration test plugin (development only)

### Plugin System

Plugins follow the `HatagoPlugin` type pattern:

```typescript
export type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>

export type HatagoContext = {
  app: Hono // Hono app instance for HTTP routes
  server: McpServer // MCP server instance for tools/resources
  env?: Record<string, unknown> // Environment variables
  getBaseUrl: (req: Request) => URL // Base URL helper
}
```

To add new plugins:

1. Create plugin in `src/plugins/`
2. Register in `src/plugins/index.ts`
3. Use `server.registerTool()` for MCP tools or `app.get()`/`app.post()` for HTTP endpoints

### MCP Endpoints

- **`POST /mcp`**: Main MCP endpoint using Streamable HTTP transport
- **`GET /.well-known/oauth-protected-resource`**: OAuth Protected Resource Metadata
- **`GET /health`**: Health check endpoint
- **`GET /`**: Simple landing page

### Key Features

- **Dual Transport Support**: Both stdio and Streamable HTTP transports fully supported
- **Progress Notifications**: Supports `_meta.progressToken` for streaming updates
- **OAuth Integration**: Built-in OAuth PRM support with Bearer token validation
- **Multi-Runtime**: Works across Node.js, Cloudflare Workers, Deno, and Bun
- **Advanced Logging**: Noren v0.6.2 integrated PII masking with 70%+ detection rate
- **MCP Proxy**: Enhanced MCP proxy with namespace management and configuration
- **Claude Desktop Ready**: Direct stdio integration without HTTP bridge required
- **Security-First**: Implements MCP security best practices and RFC compliance

## Testing MCP Functionality

Use curl to test MCP endpoints:

1. Initialize:

```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"initialize",
  "params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.0"}}
}'
```

2. List tools:

```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":2,"method":"tools/list"
}'
```

3. Call tool with progress:

```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"hello_hatago","arguments":{},"_meta":{"progressToken":"hello-1"}}
}'
```

> **Note**: Tool name uses underscores (`hello_hatago`) for MCP naming compliance

## Environment Variables

### OAuth Configuration

- `AUTH_ISSUER`: Authorization Server issuer URL (e.g., `https://auth.example.com`)
- `RESOURCE`: Resource identifier URL (defaults to request origin)
- `REQUIRE_AUTH`: Set to `"true"` to enforce Bearer token authentication on `/mcp`

### Logging Configuration

- `LOG_LEVEL`: Log level (`trace` | `debug` | `info` | `warn` | `error` | `fatal`) - default: `info`
- `LOG_FORMAT`: Log format (`json` | `pretty`) - default: `pretty`
- `NOREN_MASKING`: Enable PII masking (`true` | `false`) - default: `true`
- `LOG_SAMPLE_RATE`: Sampling rate for non-error logs (0.0-1.0) - default: `1.0`

### Transport Configuration

- `HATAGO_TRANSPORT`: Transport mode (`stdio` | `http`) - default: `http`

### Development Configuration

- `LOG_REDACT`: Comma-separated list of additional keys to redact in logs

## Project Structure

```
packages/
├── core/                   # Core Hatago framework
├── adapter-node/          # Node.js adapter
├── adapter-workers/       # Cloudflare Workers adapter
├── cli/                   # CLI tools
└── hono-mcp/              # MCP transport for Hono

apps/
└── hatago-server/         # Example Hatago server application
    ├── src/
    │   ├── app.ts              # Main application factory
    │   ├── dev-node.ts         # Node.js development server
    │   ├── stdio-server.ts     # stdio transport server (Claude Desktop integration)
    │   ├── worker.ts           # Cloudflare Workers entry point
    │   ├── config/             # Configuration management system
    │   │   ├── loader.ts       # Configuration file loader
    │   │   ├── namespace-manager.ts # Namespace management for MCP proxy
    │   │   └── types.ts        # Configuration type definitions
    │   ├── plugins/
    │   │   ├── index.ts        # Plugin registry
    │   │   ├── hello-hatago.ts # Demo streaming tool
    │   │   ├── oauth-metadata.ts # OAuth PRM support (RFC 9728)
    │   │   ├── enhanced-mcp-proxy.ts # MCP proxy with namespace management
    │   │   └── github-oauth-test.ts # GitHub OAuth integration test
    │   ├── system/
    │   │   ├── plugins.ts      # Plugin application logic
    │   │   └── types.ts        # Core type definitions
    │   └── utils/
    │       └── logger.ts       # Noren-integrated structured logger
    ├── hatago.config.json      # Configuration file for MCP proxy and server settings
    ├── package.json
    ├── tsconfig.json
    └── wrangler.jsonc          # Cloudflare Workers config

examples/
├── external-mcp-clock/    # External MCP server example
└── external-mcp-math/     # External MCP server example
```

## Code Review Guidelines (Priority Order)

1. **Basic Principles Compliance**: Fast/lightweight/simple, SF/DM principles, functional patterns
2. **Hono Specification Compliance**: Middleware structure, context type safety, error handling
3. **MCP Protocol Compliance**: JSON-RPC 2.0, tool/resource naming rules, progress notification
4. **Functional Design**: Pure function implementation, side effect separation, immutable structures
5. **Plugin Architecture**: HatagoPlugin type, stateless design, dependency management
6. **Multi-Runtime Support**: Node.js/Workers/Deno/Bun, avoid runtime-specific APIs
7. **Security**: OAuth 2.1, PII masking (Noren integration), input validation, transport security
8. **Performance**: Startup time, memory footprint, streaming processing
9. **Type Safety**: TypeScript strict, no any, type guards, explicit return types
10. **Testability**: Mockability, unit/integration tests, coverage

## Development Best Practices

### Functional Programming Guidelines
- **Pure Functions**: Prefer pure functions with no side effects
- **Immutable Data**: Use readonly types and immutable data structures
- **Function Composition**: Build complex logic through function composition
- **Side Effect Isolation**: Clearly separate side effects from pure logic

### Plugin Development Standards
- Follow `HatagoPlugin` pattern: `(ctx: HatagoContext) => void | Promise<void>`
- Keep plugins stateless when possible
- Use environment variables for configuration
- Implement proper TypeScript types for all interfaces
- Always validate inputs using Zod or similar libraries

### Performance Considerations
- Minimize startup time and memory footprint
- Use streaming processing for large data
- Avoid blocking operations in the main thread
- Consider runtime compatibility (Node.js/Workers/Deno/Bun)

## Development Notes

- The core is intentionally minimal - all functionality is added through plugins
- When adding new tools, consider progress notification support for better UX
- OAuth authentication is optional but follows RFC 9728 standards when enabled
- The project supports both single-file and streaming responses based on client capabilities
- **Claude Desktop Integration**: Use `pnpm dev:stdio` for direct integration without HTTP bridge
- **Production Logging**: Always use `LOG_FORMAT=json` and `NOREN_MASKING=true` in production
- **Tool Naming**: Use underscores in tool names for MCP compliance (e.g., `hello_hatago`)
- **Test Plugins**: `github-oauth-test.ts` is for development only - disable in production
- **Configuration**: MCP proxy settings are managed via `hatago.config.json`
- **Pure Function Priority**: Implement business logic as pure functions, isolate side effects
- **Performance Impact**: Always consider startup time and memory usage impact of changes

## MCP Security Best Practices

Hatago implements security measures based on the [Model Context Protocol Security Specifications](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices).

### Token Validation and Management

**Critical Requirements**:

- **No Token Passthrough**: MCP servers MUST NOT accept tokens that were not explicitly issued for the MCP server
- **Audience Validation**: Validate token audience and constraints to prevent unauthorized access
- **Explicit Resource Binding**: Only accept tokens explicitly issued for this resource

**Implementation Status in Hatago**:

- ✅ Bearer token validation implemented in `oauth-metadata.ts`
- ⚠️ Audience validation needs strengthening for production use
- ✅ Resource-specific token binding supported via `RESOURCE` environment variable

### Session Security

**Requirements**:

- **No Session-Based Authentication**: Do NOT use sessions for authentication
- **Secure Session IDs**: Use secure, non-deterministic session ID generation
- **User Binding**: Bind session IDs to user-specific information
- **Cryptographic Random**: Use secure random number generators for session ID generation

**Current Status**: ⚠️ Session management not yet implemented in Hatago

### Request Validation and Input Security

**Security Principles**:

- **Verify All Requests**: MCP servers MUST verify all inbound requests
- **Event Injection Prevention**: Prevent event injection attacks
- **Input Sanitization**: Validate and sanitize all inbound requests and events
- **Transport Security**: Secure handling of server-sent events

**Implementation**:

- ✅ Request validation implemented via JSON-RPC validation
- ✅ Input sanitization via Noren PII masking (v0.6.2)
- ✅ Secure SSE handling in Streamable HTTP transport

### Proxy Server Security

**Requirements**:

- **User Consent**: MUST obtain user consent for each dynamically registered client
- **Confused Deputy Prevention**: Be cautious of "confused deputy" vulnerabilities in OAuth proxy scenarios
- **Trust Boundaries**: Preserve trust boundaries between services

**Implementation**: ⚠️ Enhanced MCP proxy requires additional security hardening

## MCP Transport Specifications

Hatago supports both standard MCP transport types as defined in the [MCP Transport Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).

### stdio Transport

**Characteristics**:

- Client launches server as a subprocess
- Communication through standard input/output streams
- Simple setup with direct process management

**Technical Requirements**:

- **Encoding**: UTF-8 encoded messages
- **Format**: Individual JSON-RPC requests/notifications/responses
- **Delimiter**: Newline-separated messages
- **Constraint**: Cannot contain embedded newlines

**Hatago Implementation**:

- ✅ Full stdio support via `src/stdio-server.ts`
- ✅ UTF-8 encoding and newline delimiter compliance
- ✅ Proper stdout/stderr separation for MCP protocol compliance
- ✅ Development command: `pnpm dev:stdio`

### Streamable HTTP Transport

**Characteristics**:

- Server operates as an independent process
- Uses HTTP POST and GET requests
- Optional Server-Sent Events (SSE) for streaming capabilities
- Supports multiple concurrent connections

**Security Requirements**:

- **Origin Validation**: MUST validate `Origin` header
- **Local Binding**: Bind to localhost when possible
- **Authentication**: Implement proper authentication mechanisms
- **DNS Rebinding Prevention**: Protect against DNS rebinding attacks

**Hatago Implementation**:

- ✅ Full HTTP transport support via Hono framework
- ✅ SSE streaming for progress notifications
- ⚠️ Origin validation needs implementation
- ✅ Bearer token authentication support
- ✅ Development command: `pnpm dev`

### Transport Selection Guidelines

**MCP Specification Recommendation**: "Clients SHOULD support stdio whenever possible"

**When to Use stdio**:

- Single-user applications
- Simple tool integration
- Local development and testing
- Direct subprocess management preferred

**When to Use Streamable HTTP**:

- Multi-user environments
- Web-based integrations
- Remote server deployments
- Complex streaming requirements
- Multiple concurrent connections needed

**Hatago's Dual-Mode Approach**:

- ✅ Both transports fully supported
- ✅ Environment-agnostic architecture
- ✅ Consistent plugin API across both modes
- ✅ Same security and logging features in both modes

## OAuth 2.1 Integration Requirements

Hatago implements OAuth 2.1 authorization based on the [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization).

### Protected Resource Metadata (RFC 9728)

**Required Implementation**:

- **Metadata Endpoint**: `GET /.well-known/oauth-protected-resource`
- **Authorization Servers Field**: Must indicate authorization server locations
- **WWW-Authenticate Headers**: Clients must parse for server metadata

**Hatago Implementation**:

- ✅ PRM endpoint implemented in `oauth-metadata.ts`
- ✅ `authorization_servers` field properly configured
- ✅ Dynamic resource URL detection via environment variables
- ✅ RFC 9728 compliant metadata structure

### Token Handling and Validation

**Critical Requirements**:

- **Bearer Token Header**: Access tokens must use `Authorization: Bearer <access-token>`
- **Resource-Specific Validation**: Tokens must be issued specifically for this resource
- **No Passthrough**: Tokens must NOT be passed to other services
- **Short-Lived Tokens**: Recommended to reduce theft risks

**Hatago Implementation**:

- ✅ Bearer token extraction and validation
- ✅ Resource-specific token binding via `RESOURCE` environment variable
- ⚠️ Token audience validation needs strengthening
- ✅ No token passthrough policy enforced

### OAuth 2.1 Security Features

**PKCE (Proof Key for Code Exchange)**:

- **Purpose**: Prevent code interception attacks
- **Requirement**: Implement for both public and confidential clients
- **Validation**: Verify code_challenge and code_verifier

**Redirect URI Validation**:

- **Exact Match**: Validate exact redirect URIs
- **No Wildcards**: Prevent redirect URI manipulation
- **HTTPS Enforcement**: Use HTTPS for production redirects

**Hatago Implementation Status**:

- ✅ PKCE support in GitHub OAuth test plugin
- ⚠️ Full PKCE integration needs completion for production
- ✅ Exact redirect URI validation implemented
- ✅ HTTPS enforcement for production environments

### Compliance Standards

**Supported Specifications**:

- ✅ **OAuth 2.1 Draft**: Core authorization framework
- ✅ **RFC 8414**: OAuth 2.0 Authorization Server Metadata
- ⚠️ **RFC 7591**: OAuth 2.0 Dynamic Client Registration (partial)
- ✅ **RFC 9728**: OAuth 2.0 Protected Resource Metadata

### Security Considerations

**Confused Deputy Prevention**:

- Validate token audience matches expected resource
- Ensure tokens are not reused across different services
- Implement proper scope validation

**Code Interception Protection**:

- Use PKCE for all authorization flows
- Validate state parameters
- Implement proper redirect URI validation

**Current Security Posture**:

- ✅ Resource audience binding implemented
- ✅ State parameter validation
- ⚠️ Scope validation needs implementation
- ✅ Anti-CSRF protection via state parameters

## Anthropic MCP Directory Requirements

For inclusion in Anthropic's MCP Directory, Hatago must comply with specific [quality and safety standards](https://support.anthropic.com/en/articles/11697096-anthropic-mcp-directory-policy).

### Safety and Security Requirements

**Policy Compliance**:

- ✅ **Usage Policy Adherence**: Must not facilitate violations of Anthropic's Usage Policy
- ✅ **Safety Guardrails**: Cannot circumvent Claude's built-in safety mechanisms
- ✅ **Privacy Protection**: Prioritize user privacy and data protection
- ✅ **Data Minimization**: Collect only necessary data for functionality
- ✅ **IP Respect**: Respect intellectual property rights
- ❌ **Financial Transactions**: Cannot handle financial transactions (not applicable)

**Hatago Compliance Status**: ✅ **Compliant** - All safety requirements met

### Compatibility and Functionality Standards

**Tool Requirements**:

- ✅ **Precise Descriptions**: Tool descriptions must be accurate and unambiguous
- ✅ **Functional Matching**: Descriptions must match actual tool functionality
- ✅ **No Interference**: Cannot intentionally trigger or interfere with other servers
- ✅ **Static Behavior**: Cannot dynamically pull behavioral instructions

**Performance Standards**:

- ✅ **Reliable Performance**: Provide consistent, fast performance
- ✅ **Graceful Error Handling**: Handle errors gracefully with proper responses
- ✅ **Token Efficiency**: Use tokens efficiently in operations
- ✅ **Secure Authentication**: Use secure authentication methods
- ✅ **Transport Support**: Support required transport protocols (stdio/HTTP)

**Hatago Implementation**:

- ✅ Clear, accurate tool descriptions in all plugins
- ✅ Robust error handling with structured logging
- ✅ Efficient token usage and validation
- ✅ OAuth 2.1 secure authentication
- ✅ Full stdio and HTTP transport support

### Developer Obligations

**Documentation Requirements**:

- ⚠️ **Privacy Policy**: Must provide clear privacy policy (needs creation)
- ✅ **Contact Information**: Verified contact information available
- ✅ **Functionality Documentation**: Comprehensive server documentation
- ✅ **Testing Resources**: Testing accounts and examples provided
- ✅ **API Ownership**: Verify API endpoint ownership
- ✅ **Maintenance Commitment**: Maintain server and address issues promptly

**Terms and Compliance**:

- ⚠️ **Directory Terms**: Must agree to Anthropic's MCP Directory Terms (pending)
- ✅ **Responsive Support**: Commitment to addressing issues and updates

### Readiness Assessment for Directory Submission

**Currently Ready** ✅:

- Safety and security compliance
- Functional requirements met
- Technical standards achieved
- Documentation quality sufficient

**Needs Completion** ⚠️:

- Privacy policy creation
- Directory terms agreement
- Final security hardening (Origin validation, scope validation)

**Estimated Timeline**: Ready for submission after privacy policy creation and final security improvements

## Hatago Implementation Guidelines

This section provides comprehensive guidance for developers working with Hatago, based on MCP specifications and Anthropic requirements.

### Current Security Implementation Status

**Implemented Features** ✅:

- **Bearer Token Authentication**: Full OAuth 2.1 Bearer token support
- **Protected Resource Metadata**: RFC 9728 compliant PRM endpoint
- **Input Sanitization**: Noren v0.6.2 PII masking with 70%+ detection rate
- **Transport Security**: Secure stdio and HTTP transports
- **Error Handling**: Structured logging with security-aware error responses
- **Resource Binding**: Environment-variable controlled resource identification
- **Anti-CSRF Protection**: State parameter validation in OAuth flows

**Partially Implemented** ⚠️:

- **PKCE Support**: Available in test plugins, needs production integration
- **Token Audience Validation**: Basic validation present, needs strengthening
- **Origin Validation**: HTTP transport needs Origin header validation
- **Scope Validation**: OAuth scope handling needs implementation

**Not Yet Implemented** ❌:

- **Session Management**: Secure session ID generation and management
- **Rate Limiting**: API rate limiting for production environments
- **Comprehensive Audit Logging**: Full audit trail implementation

### Recommended Development Priorities

**Priority 1 - Security Hardening**:

1. **Origin Validation**: Implement Origin header validation for HTTP transport
2. **Token Audience Validation**: Strengthen audience validation for production tokens
3. **Scope Validation**: Implement OAuth scope validation and enforcement
4. **Rate Limiting**: Add rate limiting middleware for production deployments

**Priority 2 - Production Readiness**:

1. **Session Management**: Implement secure session handling
2. **Audit Logging**: Add comprehensive audit logging
3. **Privacy Policy**: Create privacy policy for directory submission
4. **Health Check Enhancement**: Add detailed health and metrics endpoints

**Priority 3 - Developer Experience**:

1. **Plugin Templates**: Create standardized plugin templates
2. **Testing Framework**: Enhance testing infrastructure
3. **Documentation**: Expand plugin development documentation
4. **Hot Reload**: Implement plugin hot reloading for development

### Plugin Development Best Practices

**Security Guidelines**:

- Always validate plugin inputs using Zod or similar validation libraries
- Use the Noren logger for PII-aware logging: `import { logger } from '../utils/logger.js'`
- Implement proper error boundaries and graceful degradation
- Never store sensitive data in plain text or logs

**Architecture Patterns**:

- Keep plugins stateless when possible
- Use environment variables for configuration
- Implement proper TypeScript types for all plugin interfaces
- Follow the `HatagoPlugin` pattern: `(ctx: HatagoContext) => void | Promise<void>`

**Testing Recommendations**:

- Test both stdio and HTTP transport modes
- Validate OAuth flows with both valid and invalid tokens
- Test error conditions and edge cases
- Verify PII masking functionality in logs

### Environment Configuration Guide

**Essential Environment Variables**:

```bash
# OAuth Configuration
AUTH_ISSUER=https://auth.example.com    # Authorization server URL
RESOURCE=https://api.example.com        # Resource identifier
REQUIRE_AUTH=true                       # Enforce authentication

# Logging Configuration
LOG_LEVEL=info                          # debug|info|warn|error
LOG_FORMAT=pretty                       # json|pretty
NOREN_MASKING=true                      # Enable PII masking

# Transport Configuration
HATAGO_TRANSPORT=http                   # stdio|http
```

**Development vs Production**:

- **Development**: Use `REQUIRE_AUTH=false` for easier testing
- **Production**: Always use `REQUIRE_AUTH=true` with proper OAuth setup
- **Logging**: Use `LOG_FORMAT=json` in production for structured logging
- **PII Masking**: Always keep `NOREN_MASKING=true` in production

### Compliance Checklist

**Before Production Deployment**:

- [ ] Origin validation implemented for HTTP transport
- [ ] Token audience validation strengthened
- [ ] Rate limiting configured appropriately
- [ ] Audit logging enabled
- [ ] Privacy policy created and accessible
- [ ] Error handling covers all edge cases
- [ ] PII masking verified in all log outputs
- [ ] Security testing completed

**Before Directory Submission**:

- [ ] All MCP specification requirements verified
- [ ] Security best practices implemented
- [ ] Tool descriptions accurate and complete
- [ ] Testing resources provided
- [ ] Documentation comprehensive
- [ ] Contact information verified
- [ ] Directory terms agreed upon
