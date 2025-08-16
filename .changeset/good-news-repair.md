---
'@hatago/adapter-node': patch
'@hatago/adapter-workers': patch
'@hatago/cli': patch
'@hatago/core': patch
'@hatago/config': patch
'@hatago/hono-mcp': patch
'@hatago/plugin-concurrency-limiter': patch
'@hatago/plugin-github-oauth': patch
'@hatago/plugin-hello-hatago': patch
'@hatago/plugin-kv': patch
'@hatago/plugin-logger': patch
'@hatago/plugin-oauth-metadata': patch
'@hatago/plugin-rate-limit': patch
---

Setup automated CI/CD pipeline with Changesets for npm releases

- Added automated release workflow using GitHub Actions and Changesets
- Configured changeset for public npm publishing with GitHub changelog integration
- Added PR checks to validate changesets and preview version changes
- Enhanced documentation with detailed release process instructions
- Fixed changeset configuration validation errors and dependency management
- Prepared all packages for automated npm publishing with proper access controls
