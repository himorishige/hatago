# @hatago/core

## 0.3.1

### Patch Changes

- fb06c02: Optimize adapter architecture by extracting common functionality to core package

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

## 0.3.0

### Minor Changes

- 2aeb2f7: Enhanced packages

## 0.2.0

### Minor Changes

- 2e9ebdf: Enhanced packages

## 0.1.2

### Patch Changes

- 17d413a: - Enhancement of Hatago packages
- Updated dependencies [17d413a]
  - @hatago/hono-mcp@0.1.1
