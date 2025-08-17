---
'@hatago/adapter-workers': patch
'@hatago/adapter-node': patch
'@hatago/core': patch
---

Optimize adapter architecture by extracting common functionality to core package

## Changes

### Core Package

- **Added `mcp-setup.ts`**: Centralized MCP endpoint configuration logic
- **Added `env-utils.ts`**: Shared environment variable normalization utilities
- **Export new utilities**: `setupMCPEndpoint` and `convertNodeEnv` functions

### Adapter Packages

- **Simplified adapter-node**: Reduced code size by ~30% (72→50 lines) by using shared utilities
- **Simplified adapter-workers**: Reduced code size by ~20% (58→46 lines) by using shared utilities
- **Eliminated code duplication**: Removed redundant MCP setup and environment handling logic
- **Updated documentation**: Simplified README examples to reflect cleaner API usage

## Benefits

- **Better maintainability**: Common logic centralized in one place
- **Easier testing**: Shared utilities can be tested independently
- **Consistent behavior**: Same MCP setup across all adapters
- **Reduced bundle size**: Less duplicate code in final builds
- **Future-proof**: New adapters can reuse established patterns

## Backward Compatibility

- **No breaking changes**: All existing APIs remain unchanged
- **Full functionality preserved**: All features work exactly as before
- **Verified compatibility**: All 7 plugin examples tested successfully
