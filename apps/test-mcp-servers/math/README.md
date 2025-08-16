# Test MCP Math Server

Test MCP server providing mathematical calculation functionality for testing Hatago's MCP proxy features. This is a development/testing tool, not a production server or example implementation.

## Purpose

This server is used to test:

- MCP proxy namespace management
- Tool name conflict resolution
- External MCP server integration
- Proxy performance and error handling

## Features

- **math.calculate** - Perform basic mathematical calculations
- **math.random** - Generate random numbers with various distributions
- **math.factorial** - Calculate factorials
- Health check endpoint

## Quick Start

### Install Dependencies

```bash
cd apps/test-mcp-servers/math
npm install
```

### Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

Server runs on: http://localhost:8789

## Available Tools

### math.calculate

Perform basic mathematical calculations.

**Parameters:**

- `expression` (string): Mathematical expression to evaluate

### math.random

Generate random numbers.

**Parameters:**

- `min` (number): Minimum value (default: 0)
- `max` (number): Maximum value (default: 1)
- `distribution` (string): "uniform", "normal", "exponential" (default: "uniform")

### math.factorial

Calculate factorial of a number.

**Parameters:**

- `n` (number): Number to calculate factorial of (0-170)

## Use with Hatago

Configure in `hatago.config.json`:

```json
{
  "externalMcp": {
    "servers": [
      {
        "id": "math-server",
        "endpoint": "http://localhost:8789",
        "namespace": "math",
        "policies": {
          "cache": { "toolsTTL": 300000 }
        }
      }
    ]
  }
}
```

## Development Notes

This is a test server designed to exercise Hatago's proxy capabilities. It intentionally uses common tool names (like "calculate") to test namespace collision handling.

## License

Internal test tool for Hatago development.
