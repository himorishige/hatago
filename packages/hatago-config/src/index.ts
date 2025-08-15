// Export schemas and types
export * from './schema.js'

// Export configuration loader
export {
  loadConfig,
  validateConfig,
  getDefaultConfig,
  generateConfigTemplate,
  ConfigValidationError,
  type LoadConfigOptions,
  type ConfigSearchResult,
} from './loader.js'

// Export diagnostic tools
export {
  diagnoseConfig,
  generateConfigFixes,
  formatDiagnostics,
  type DiagnosticSeverity,
  type DiagnosticIssue,
  type DiagnosticReport,
} from './doctor.js'

// Export template engine
export {
  TemplateEngine,
  type TemplateConfig,
  type TemplateFile,
  type TemplatePrompt,
  type TemplateContext,
  type TemplateResult,
  type GeneratedFile,
} from './template.js'
